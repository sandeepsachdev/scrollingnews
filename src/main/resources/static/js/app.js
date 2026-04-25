const POLL_MS = 2000;
const MAX_ITEMS = 300;      // cap DOM size

const statusEl      = document.getElementById('status-text');
const newsList      = document.getElementById('news-list');
const newsInner     = document.getElementById('news-inner');
const clearBtn      = document.getElementById('clear-btn');
const updatesPage   = document.getElementById('updates-page');
const updatesInner  = document.getElementById('updates-inner');
const updatesStatus = document.getElementById('updates-status');
const navFeedBtn    = document.getElementById('nav-feed');
const navUpdatesBtn = document.getElementById('nav-updates');

let pollTimerId    = null;
let countdownTimer = null;

let nextPollAt    = 0;
let lastSeq       = null;   // null until server is initialized; then tracks our cursor

let lastTotalLoaded  = 0;
let lastState        = 'INITIALIZING';
let lastSourcesRead  = 0;
let lastTotalSources = 0;

let updatesRefreshTimer   = null;
let updatesCountdown      = 30;
let currentPage           = 'feed';

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(ts) {
    const d = new Date(ts);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const day   = String(d.getDate()).padStart(2, '0');
    const month = months[d.getMonth()];
    const year  = d.getFullYear();
    const hh    = String(d.getHours()).padStart(2, '0');
    const mm    = String(d.getMinutes()).padStart(2, '0');
    return day + ' ' + month + ' ' + year + '  ' + hh + ':' + mm;
}

function stripHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').trim();
}

function fmt(n) { return n.toLocaleString(); }

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── top bar ───────────────────────────────────────────────────────────────────

function updateTopBar() {
    const parts = [];

    if (lastState === 'INITIALIZING') {
        parts.push('Reading sources  ' + lastSourcesRead + ' / ' + lastTotalSources);
        if (lastTotalLoaded > 0) parts.push(fmt(lastTotalLoaded) + ' loaded');
    } else {
        parts.push(fmt(lastTotalLoaded) + ' loaded');
        if (nextPollAt > 0) {
            const secs = Math.max(0, Math.ceil((nextPollAt - Date.now()) / 1000));
            parts.push('next refresh in ' + secs + 's');
        }
    }

    statusEl.textContent = parts.join('  ·  ');
}

function startCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = setInterval(updateTopBar, 1000);
}

// ── article list ──────────────────────────────────────────────────────────────

function buildItem(article) {
    const el = document.createElement('a');
    el.className = 'news-item';
    if (article.link && /^https?:\/\//i.test(article.link)) {
        el.href   = article.link;
        el.target = '_blank';
        el.rel    = 'noopener noreferrer';
    }
    const desc = stripHtml(article.description);
    el.innerHTML =
        '<div class="news-meta">' +
            '<span class="news-source">' + escHtml(article.source) + '</span>' +
            '<span class="news-time">'   + formatDateTime(article.publishedAt) + '</span>' +
        '</div>' +
        '<div class="news-title">' + escHtml(article.title) + '</div>' +
        (desc ? '<div class="news-desc">' + escHtml(desc) + '</div>' : '');
    return el;
}

function addArticles(articles) {
    // Sort newest first within this batch
    const sorted = [...articles].sort((a, b) => b.publishedAt - a.publishedAt);

    const prevScrollHeight = newsList.scrollHeight;
    const atTop = newsList.scrollTop === 0;

    const frag = document.createDocumentFragment();
    sorted.forEach(a => frag.appendChild(buildItem(a)));
    newsInner.insertBefore(frag, newsInner.firstChild);

    // Trim oldest items from the bottom to keep DOM lean
    while (newsInner.children.length > MAX_ITEMS) {
        newsInner.removeChild(newsInner.lastChild);
    }

    // If the user has scrolled down, maintain their position
    if (!atTop) {
        newsList.scrollTop += newsList.scrollHeight - prevScrollHeight;
    }
}

// ── polling ───────────────────────────────────────────────────────────────────

async function poll() {
    try {
        const url = lastSeq === null ? '/api/status' : '/api/status?since=' + lastSeq;
        const res  = await fetch(url);
        const data = await res.json();

        nextPollAt       = data.nextPollAt    || 0;
        lastTotalLoaded  = data.totalLoaded   || 0;
        lastState        = data.state;
        lastSourcesRead  = data.sourcesRead   || 0;
        lastTotalSources = data.totalSources  || 0;

        updateTopBar();

        if (data.state !== 'INITIALIZING') {
            if (lastSeq === null) {
                // First initialized response — commit baseline, skip current articles
                lastSeq = data.latestSeq;
            } else {
                // Show any articles newer than our cursor, then advance cursor
                if (data.articles && data.articles.length > 0) {
                    addArticles(data.articles);
                }
                lastSeq = data.latestSeq;
            }
        }

        schedulePoll(POLL_MS);
    } catch (_) {
        schedulePoll(POLL_MS * 3);
    }
}

function schedulePoll(delay) {
    clearTimeout(pollTimerId);
    pollTimerId = setTimeout(poll, delay);
}

// ── clear button ──────────────────────────────────────────────────────────────

clearBtn.addEventListener('click', () => {
    newsInner.innerHTML = '';
});

// ── navigation ────────────────────────────────────────────────────────────────

navFeedBtn.addEventListener('click', () => showPage('feed'));
navUpdatesBtn.addEventListener('click', () => showPage('updates'));

function showPage(page) {
    currentPage = page;
    if (page === 'feed') {
        newsList.style.display = '';
        clearBtn.style.display = '';
        updatesPage.style.display = 'none';
        navFeedBtn.classList.add('active');
        navUpdatesBtn.classList.remove('active');
        stopUpdatesRefresh();
    } else {
        newsList.style.display = 'none';
        clearBtn.style.display = 'none';
        updatesPage.style.display = 'block';
        navFeedBtn.classList.remove('active');
        navUpdatesBtn.classList.add('active');
        fetchUpdates();
        startUpdatesRefresh();
    }
}

// ── updates page ──────────────────────────────────────────────────────────────

async function fetchUpdates() {
    try {
        const res    = await fetch('/api/feed-updates');
        const events = await res.json();
        renderUpdates(events);
        updatesCountdown = 30;
        renderUpdatesStatus();
    } catch (_) {
        // silent fail
    }
}

function renderUpdates(events) {
    if (!events || events.length === 0) {
        updatesInner.innerHTML = '<div class="updates-empty">No updates detected yet</div>';
        return;
    }

    // Group by detectedAt (one timestamp per poll cycle)
    const cycleMap = new Map();
    events.forEach(e => {
        if (!cycleMap.has(e.detectedAt)) cycleMap.set(e.detectedAt, []);
        cycleMap.get(e.detectedAt).push(e);
    });

    // Newest cycle first
    const sorted = [...cycleMap.entries()].sort((a, b) => b[0] - a[0]);

    const html = sorted.map(([ts, entries]) => {
        const totalNew = entries.reduce((sum, e) => sum + e.newArticles, 0);
        const rows = entries
            .sort((a, b) => b.newArticles - a.newArticles)
            .map(e =>
                '<div class="cycle-entry">' +
                    '<span class="entry-source">' + escHtml(e.source) + '</span>' +
                    '<span class="entry-count">' + e.newArticles + ' new article' + (e.newArticles !== 1 ? 's' : '') + '</span>' +
                '</div>'
            ).join('');
        return '<div class="update-cycle">' +
            '<div class="cycle-header">' +
                '<span class="cycle-time">' + formatDateTime(ts) + '</span>' +
                '<span class="cycle-summary">' + entries.length + ' source' + (entries.length !== 1 ? 's' : '') + '  &middot;  ' + totalNew + ' new article' + (totalNew !== 1 ? 's' : '') + '</span>' +
            '</div>' +
            rows +
        '</div>';
    }).join('');

    updatesInner.innerHTML = html;
}

function renderUpdatesStatus() {
    updatesStatus.textContent = 'refreshing in ' + updatesCountdown + 's';
}

function startUpdatesRefresh() {
    updatesCountdown = 30;
    renderUpdatesStatus();
    clearInterval(updatesRefreshTimer);
    updatesRefreshTimer = setInterval(() => {
        updatesCountdown = Math.max(0, updatesCountdown - 1);
        renderUpdatesStatus();
        if (updatesCountdown === 0) {
            fetchUpdates();
        }
    }, 1000);
}

function stopUpdatesRefresh() {
    clearInterval(updatesRefreshTimer);
    updatesRefreshTimer = null;
}

// ── boot ──────────────────────────────────────────────────────────────────────
startCountdown();
schedulePoll(500);
