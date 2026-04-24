const SCROLL_SPEED = 80;    // pixels per second — slow enough to read headlines
const POLL_MS = 2000;       // how often to check the backend when not scrolling

const statusEl = document.getElementById('status-text');
const scrollContainer = document.getElementById('scroll-container');

let animFrameId = null;
let pollTimerId = null;
let countdownTimerId = null;
let scrolling = false;
let nextPollAt = 0;
let initialPollCycle = null;
let seenFirstCycle = false;

// Last-known values for the top bar (kept so the countdown can re-render alone)
let lastTotalLoaded = 0;
let lastUnseenCount = 0;
let lastState = 'INITIALIZING';
let lastSourcesRead = 0;
let lastTotalSources = 0;

// ── helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60_000)       return 'just now';
    if (diff < 3_600_000)    return Math.floor(diff / 60_000) + 'm ago';
    if (diff < 86_400_000)   return Math.floor(diff / 3_600_000) + 'h ago';
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function stripHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').trim();
}

function fmt(n) {
    return n.toLocaleString();
}

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
        if (lastTotalLoaded > 0) {
            parts.push(fmt(lastTotalLoaded) + ' loaded');
        }
    } else {
        parts.push(fmt(lastTotalLoaded) + ' loaded');
        if (seenFirstCycle && lastUnseenCount > 0) {
            parts.push(fmt(lastUnseenCount) + ' unseen');
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

// ── article items ─────────────────────────────────────────────────────────────

function buildItem(article) {
    const el = document.createElement('a');
    el.className = 'news-item';
    if (article.link && /^https?:\/\//i.test(article.link)) {
        el.href = article.link;
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
    }
    const desc = stripHtml(article.description);
    el.innerHTML =
        '<div class="news-meta">' +
            '<span class="news-source">' + escHtml(article.source) + '</span>' +
            '<span class="news-time">'   + relativeTime(article.publishedAt) + '</span>' +
        '</div>' +
        '<div class="news-title">' + escHtml(article.title) + '</div>' +
        (desc ? '<div class="news-desc">' + escHtml(desc) + '</div>' : '');
    return el;
}

// ── scroll animation ──────────────────────────────────────────────────────────

function startScrolling(articles) {
    scrolling = true;
    stopCountdown();
    scrollContainer.innerHTML = '';

    articles.forEach(a => scrollContainer.appendChild(buildItem(a)));

    const totalHeight = scrollContainer.scrollHeight;
    const vh = window.innerHeight;

    // Start below the viewport and scroll upward so articles enter from the bottom
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

    fetch('/api/complete', { method: 'POST' }).catch(() => {});

    startCountdown();
    schedulePoll(POLL_MS);
}

// ── polling ───────────────────────────────────────────────────────────────────

async function poll() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();

        nextPollAt      = data.nextPollAt   || 0;
        lastTotalLoaded = data.totalLoaded  || 0;
        lastUnseenCount = data.unseenCount  || 0;
        lastState       = data.state;
        lastSourcesRead = data.sourcesRead  || 0;
        lastTotalSources = data.totalSources || 0;

        if (initialPollCycle === null) {
            initialPollCycle = data.pollCycle;
            // Discard any articles already queued before this page load
            if (data.state === 'ARTICLES_READY') {
                fetch('/api/complete', { method: 'POST' }).catch(() => {});
            }
        }
        if (data.pollCycle > initialPollCycle) {
            seenFirstCycle = true;
        }

        updateTopBar();

        if (data.state === 'INITIALIZING') {
            stopCountdown();
            schedulePoll(POLL_MS);

        } else if (seenFirstCycle && data.state === 'ARTICLES_READY' &&
                   data.articles && data.articles.length > 0) {
            stopCountdown();
            startScrolling(data.articles);
            // scrolling takes over; onScrollDone will reschedule polling

        } else {
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
