const SCROLL_SPEED = 80;    // pixels per second — slow enough to read headlines
const POLL_MS = 2000;       // how often to check the backend when not scrolling

const statusEl = document.getElementById('status-text');
const scrollContainer = document.getElementById('scroll-container');

let animFrameId = null;
let pollTimerId = null;
let countdownTimerId = null;
let scrolling = false;
let nextPollAt = 0;

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

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── countdown ────────────────────────────────────────────────────────────────

function startCountdown() {
    statusEl.classList.add('waiting');
    clearInterval(countdownTimerId);
    countdownTimerId = setInterval(updateCountdown, 1000);
    updateCountdown();
}

function stopCountdown() {
    statusEl.classList.remove('waiting');
    clearInterval(countdownTimerId);
    countdownTimerId = null;
}

function updateCountdown() {
    const secs = Math.max(0, Math.ceil((nextPollAt - Date.now()) / 1000));
    statusEl.textContent = 'Waiting for news  ·  next refresh in ' + secs + 's';
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

    fetch('/api/complete', { method: 'POST' }).catch(() => {});

    schedulePoll(POLL_MS);
}

// ── polling ───────────────────────────────────────────────────────────────────

async function poll() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();

        nextPollAt = data.nextPollAt || 0;

        if (data.state === 'INITIALIZING') {
            stopCountdown();
            statusEl.textContent = 'Reading sources  ' + data.sourcesRead + ' / ' + data.totalSources;
            schedulePoll(POLL_MS);

        } else if (data.state === 'ARTICLES_READY' && data.articles && data.articles.length > 0) {
            stopCountdown();
            startScrolling(data.articles);
            // scrolling takes over; onScrollDone will reschedule polling

        } else {
            // IDLE — show waiting message with live countdown
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
