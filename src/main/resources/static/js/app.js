const SCROLL_SPEED = 80;    // pixels per second — slow enough to read headlines
const POLL_MS = 2000;       // how often to check the backend when not scrolling

const statusEl  = document.getElementById('status-text');
const showBtn   = document.getElementById('show-btn');
const scrollContainer = document.getElementById('scroll-container');

let animFrameId = null;
let pollTimerId = null;
let countdownTimerId = null;
let scrolling = false;
let nextPollAt = 0;
let initialPollCycle = null;
let seenFirstCycle = false;

// Articles received from the server but not yet shown to the user
const clientQueue = [];

// Last-known counts for the top bar
let lastTotalLoaded = 0;
let lastState = 'INITIALIZING';
let lastSourcesRead = 0;
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
        if (seenFirstCycle && clientQueue.length > 0) {
            parts.push(fmt(clientQueue.length) + ' unseen');
        }
        if (nextPollAt > 0) {
            const secs = Math.max(0, Math.ceil((nextPollAt - Date.now()) / 1000));
            parts.push('next refresh in ' + secs + 's');
        }
    }

    statusEl.textContent = parts.join('  ·  ');
}

function startCountdown() {
    clearInterval(countdownTimerId);
    countdownTimerId = setInterval(updateTopBar, 1000);
}

function stopCountdown() {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
}

// ── show button ───────────────────────────────────────────────────────────────

function updateShowBtn() {
    if (clientQueue.length > 0 && !scrolling) {
        showBtn.textContent = 'Show ' + fmt(clientQueue.length) + ' articles';
        showBtn.style.display = 'block';
    } else {
        showBtn.style.display = 'none';
    }
}

showBtn.addEventListener('click', function () {
    if (clientQueue.length === 0 || scrolling) return;
    const articles = clientQueue.splice(0);   // drain queue
    showBtn.style.display = 'none';
    stopCountdown();
    startScrolling(articles);
});

// ── article items ─────────────────────────────────────────────────────────────

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

// ── scroll animation ──────────────────────────────────────────────────────────

function startScrolling(articles) {
    scrolling = true;
    scrollContainer.innerHTML = '';
    updateTopBar();

    articles.forEach(a => scrollContainer.appendChild(buildItem(a)));

    const totalHeight = scrollContainer.scrollHeight;
    const vh = window.innerHeight;

    let y = vh;
    scrollContainer.style.transform = 'translateY(' + y + 'px)';

    let lastTs = null;

    function frame(ts) {
        if (!lastTs) lastTs = ts;
        const dt = (ts - lastTs) / 1000;
        lastTs = ts;

        y -= SCROLL_SPEED * dt;
        scrollContainer.style.transform = 'translateY(' + y + 'px)';

        if (y > -totalHeight) {
            animFrameId = requestAnimationFrame(frame);
        } else {
            onScrollDone();
        }
    }

    animFrameId = requestAnimationFrame(frame);
}

function onScrollDone() {
    scrolling = false;
    scrollContainer.innerHTML = '';
    scrollContainer.style.transform = '';

    // Show button if more arrived while we were scrolling
    updateShowBtn();
    updateTopBar();
    startCountdown();
    schedulePoll(POLL_MS);
}

// ── polling ───────────────────────────────────────────────────────────────────

async function poll() {
    try {
        const res  = await fetch('/api/status');
        const data = await res.json();

        nextPollAt      = data.nextPollAt    || 0;
        lastTotalLoaded = data.totalLoaded   || 0;
        lastState       = data.state;
        lastSourcesRead = data.sourcesRead   || 0;
        lastTotalSources = data.totalSources || 0;

        if (initialPollCycle === null) {
            initialPollCycle = data.pollCycle;
            // Discard any articles that were queued before this page loaded
            if (data.state === 'ARTICLES_READY') {
                fetch('/api/complete', { method: 'POST' }).catch(() => {});
            }
        }
        if (data.pollCycle > initialPollCycle) {
            seenFirstCycle = true;
        }

        if (data.state === 'INITIALIZING') {
            stopCountdown();
            updateTopBar();
            schedulePoll(POLL_MS);

        } else if (seenFirstCycle && data.state === 'ARTICLES_READY' &&
                   data.articles && data.articles.length > 0) {
            // Queue the articles client-side and immediately free the backend
            data.articles.forEach(a => clientQueue.push(a));
            fetch('/api/complete', { method: 'POST' }).catch(() => {});
            updateTopBar();
            updateShowBtn();
            startCountdown();
            schedulePoll(POLL_MS);

        } else {
            updateTopBar();
            startCountdown();
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

// ── boot ──────────────────────────────────────────────────────────────────────
schedulePoll(500);
