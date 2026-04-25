const SCROLL_SPEED = 50;    // px/s — gentle downward scroll through the list
const POLL_MS = 2000;
const MAX_ITEMS = 300;      // cap DOM size

const statusEl  = document.getElementById('status-text');
const newsList  = document.getElementById('news-list');
const newsInner = document.getElementById('news-inner');
const clearBtn  = document.getElementById('clear-btn');

let pollTimerId    = null;
let countdownTimer = null;
let scrollFrame    = null;
let scrollTop      = 0;     // current translateY offset (positive = scrolled down)
let lastScrollTs   = null;

let nextPollAt    = 0;
let initialPollCycle = null;
let seenFirstCycle   = false;

let lastTotalLoaded  = 0;
let lastState        = 'INITIALIZING';
let lastSourcesRead  = 0;
let lastTotalSources = 0;

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

// ── auto-scroll ───────────────────────────────────────────────────────────────

function startAutoScroll() {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    lastScrollTs = null;
    scrollFrame = requestAnimationFrame(autoScrollFrame);
}

function stopAutoScroll() {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
}

function autoScrollFrame(ts) {
    if (!lastScrollTs) lastScrollTs = ts;
    const dt = (ts - lastScrollTs) / 1000;
    lastScrollTs = ts;

    const maxScroll = newsInner.scrollHeight - newsList.clientHeight;

    if (maxScroll <= 0) {
        // Content fits without scrolling
        newsInner.style.transform = 'translateY(0)';
        scrollTop = 0;
        scrollFrame = null;
        return;
    }

    if (scrollTop < maxScroll) {
        scrollTop = Math.min(scrollTop + SCROLL_SPEED * dt, maxScroll);
        newsInner.style.transform = 'translateY(' + (-scrollTop) + 'px)';
        scrollFrame = requestAnimationFrame(autoScrollFrame);
    } else {
        // Reached the bottom — stop and wait for new articles
        scrollFrame = null;
    }
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

    // Build fragment and prepend before existing items
    const frag = document.createDocumentFragment();
    sorted.forEach(a => frag.appendChild(buildItem(a)));
    newsInner.insertBefore(frag, newsInner.firstChild);

    // Trim oldest items from the bottom to keep DOM lean
    while (newsInner.children.length > MAX_ITEMS) {
        newsInner.removeChild(newsInner.lastChild);
    }

    // Reset to top so newest articles are immediately visible
    stopAutoScroll();
    scrollTop = 0;
    newsInner.style.transform = 'translateY(0)';

    // Start scrolling down through the list
    startAutoScroll();
}

// ── polling ───────────────────────────────────────────────────────────────────

async function poll() {
    try {
        const res  = await fetch('/api/status');
        const data = await res.json();

        nextPollAt       = data.nextPollAt    || 0;
        lastTotalLoaded  = data.totalLoaded   || 0;
        lastState        = data.state;
        lastSourcesRead  = data.sourcesRead   || 0;
        lastTotalSources = data.totalSources  || 0;

        if (initialPollCycle === null) {
            initialPollCycle = data.pollCycle;
            if (data.state === 'ARTICLES_READY') {
                fetch('/api/complete', { method: 'POST' }).catch(() => {});
            }
        }
        if (data.pollCycle > initialPollCycle) {
            seenFirstCycle = true;
        }

        updateTopBar();

        if (data.state === 'INITIALIZING') {
            schedulePoll(POLL_MS);

        } else if (seenFirstCycle && data.state === 'ARTICLES_READY' &&
                   data.articles && data.articles.length > 0) {
            addArticles(data.articles);
            fetch('/api/complete', { method: 'POST' }).catch(() => {});
            schedulePoll(POLL_MS);

        } else {
            schedulePoll(POLL_MS);
        }
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
    stopAutoScroll();
    newsInner.innerHTML = '';
    scrollTop = 0;
    newsInner.style.transform = '';
});

// ── boot ──────────────────────────────────────────────────────────────────────
startCountdown();
schedulePoll(500);
