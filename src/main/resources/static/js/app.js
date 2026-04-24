const SCROLL_SPEED = 80;    // pixels per second — slow enough to read headlines
const POLL_MS = 2000;       // how often to check the backend when not scrolling

const statusEl = document.getElementById('status-text');
const scrollContainer = document.getElementById('scroll-container');

let animFrameId = null;
let pollTimerId = null;
let scrolling = false;

// ── helpers ──────────────────────────────────────────────────────────────────

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

function buildItem(article) {
    const el = document.createElement('div');
    el.className = 'news-item';
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

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── scroll animation ──────────────────────────────────────────────────────────

function startScrolling(articles) {
    scrolling = true;
    statusEl.textContent = '';
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
    statusEl.textContent = '';

    fetch('/api/complete', { method: 'POST' }).catch(() => {});

    schedulePoll(POLL_MS);
}

// ── polling ───────────────────────────────────────────────────────────────────

async function poll() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();

        if (data.state === 'INITIALIZING') {
            statusEl.textContent = 'Reading sources  ' + data.sourcesRead + ' / ' + data.totalSources;
            schedulePoll(POLL_MS);

        } else if (data.state === 'ARTICLES_READY' && data.articles && data.articles.length > 0) {
            startScrolling(data.articles);
            // scrolling takes over; onScrollDone will reschedule polling

        } else {
            // IDLE — nothing new yet
            statusEl.textContent = '';
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
