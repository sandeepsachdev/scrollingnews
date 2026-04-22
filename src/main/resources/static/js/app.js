'use strict';

// ── State ────────────────────────────────────────────────────────────────────
const REFRESH_MS  = 120_000;   // 2 minutes
const SPEEDS      = [15, 30, 50, 80];  // px/s options
let speedIndex    = 1;          // default: 30 px/s
let isScrolling   = true;
let knownIds      = new Set();
let lastTimestamp = null;
let rafId         = null;
let refreshCountdown = REFRESH_MS / 1000;
let countdownInterval = null;

const articlesList  = document.getElementById('articlesList');
const pauseBtn      = document.getElementById('pauseBtn');
const slowBtn       = document.getElementById('slowBtn');
const fastBtn       = document.getElementById('fastBtn');
const restartBtn    = document.getElementById('restartBtn');
const restartFab    = document.getElementById('restartFab');
const refreshTimer  = document.getElementById('refreshTimer');
const articleCount  = document.getElementById('articleCount');
const newBanner     = document.getElementById('newBanner');
const newBannerText = document.getElementById('newBannerText');

let scrollAccum = 0;   // fractional pixel accumulator

// ── Auto-scroll (requestAnimationFrame) ─────────────────────────────────────
function scrollStep(timestamp) {
    if (isScrolling) {
        if (lastTimestamp !== null) {
            const elapsed = timestamp - lastTimestamp;
            scrollAccum  += (SPEEDS[speedIndex] * elapsed) / 1000;
            const whole   = Math.floor(scrollAccum);
            if (whole > 0) {
                window.scrollBy(0, whole);
                scrollAccum -= whole;
            }
        }
        lastTimestamp = timestamp;
    } else {
        lastTimestamp = null;
        scrollAccum   = 0;
    }
    rafId = requestAnimationFrame(scrollStep);
}

function startScroll() {
    if (!rafId) rafId = requestAnimationFrame(scrollStep);
}

// ── Pause / Resume ───────────────────────────────────────────────────────────
pauseBtn.addEventListener('click', () => {
    isScrolling = !isScrolling;
    lastTimestamp = null;
    if (isScrolling) {
        pauseBtn.querySelector('.btn-icon').innerHTML = '&#9646;&#9646;';
        pauseBtn.querySelector('.btn-label').textContent = 'Pause';
        pauseBtn.classList.remove('active');
    } else {
        pauseBtn.querySelector('.btn-icon').innerHTML = '&#9654;';
        pauseBtn.querySelector('.btn-label').textContent = 'Resume';
        pauseBtn.classList.add('active');
    }
});

// ── Speed controls ───────────────────────────────────────────────────────────
slowBtn.addEventListener('click', () => {
    if (speedIndex > 0) speedIndex--;
});
fastBtn.addEventListener('click', () => {
    if (speedIndex < SPEEDS.length - 1) speedIndex++;
});

// ── Restart from newest ──────────────────────────────────────────────────────
function restartFromNewest() {
    // Resume scrolling if paused
    if (!isScrolling) {
        isScrolling = true;
        pauseBtn.querySelector('.btn-icon').innerHTML = '&#9646;&#9646;';
        pauseBtn.querySelector('.btn-label').textContent = 'Pause';
        pauseBtn.classList.remove('active');
    }
    lastTimestamp = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

restartBtn.addEventListener('click', restartFromNewest);
restartFab.addEventListener('click', restartFromNewest);

// Show FAB once user has scrolled past ~300px
window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
        restartFab.classList.remove('hidden');
    } else {
        restartFab.classList.add('hidden');
    }
}, { passive: true });

// ── Countdown timer ──────────────────────────────────────────────────────────
function startCountdown() {
    refreshCountdown = REFRESH_MS / 1000;
    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        refreshCountdown = Math.max(0, refreshCountdown - 1);
        const m = Math.floor(refreshCountdown / 60);
        const s = refreshCountdown % 60;
        refreshTimer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }, 1000);
}

// ── Source → CSS class ───────────────────────────────────────────────────────
function sourceBadgeClass(source) {
    const s = (source || '').toLowerCase();
    if (s.includes('hacker'))   return 'hn';
    if (s.includes('bbc'))      return 'bbc';
    if (s.includes('guardian')) return 'guardian';
    if (s.includes('reddit'))   return 'reddit';
    if (s.includes('jazeera'))  return 'aljazeera';
    if (s.includes('npr'))      return 'npr';
    return '';
}

// ── Time formatting ──────────────────────────────────────────────────────────
function formatTime(isoStr) {
    const d = new Date(isoStr);
    if (isNaN(d)) return '';
    const now  = new Date();
    const diff = Math.floor((now - d) / 1000);

    let ago;
    if (diff < 60)          ago = 'just now';
    else if (diff < 3600)   ago = `${Math.floor(diff / 60)}m ago`;
    else if (diff < 86400)  ago = `${Math.floor(diff / 3600)}h ago`;
    else                    ago = `${Math.floor(diff / 86400)}d ago`;

    const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${ago} &bull; ${dateStr} ${timeStr}`;
}

// ── Render a single article card ─────────────────────────────────────────────
function renderArticle(article, isNew) {
    const a = document.createElement('a');
    a.href   = article.url;
    a.target = '_blank';
    a.rel    = 'noopener noreferrer';
    a.className = 'article-card' + (isNew ? ' slide-in' : '');
    a.dataset.id = article.id;

    const badgeClass = sourceBadgeClass(article.source);
    const newBadgeHtml = isNew
        ? '<span class="new-badge">NEW</span>'
        : '';

    a.innerHTML = `
        <div class="card-meta">
            <span class="source-badge ${badgeClass}">${escHtml(article.source)}</span>
            <span class="article-time">${formatTime(article.publishedAt)}</span>
            ${newBadgeHtml}
        </div>
        <div class="card-title">${escHtml(article.title)}</div>
        ${article.description
            ? `<div class="card-description">${escHtml(article.description)}</div>`
            : ''}
    `;
    return a;
}

function escHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Initial render (no animations) ──────────────────────────────────────────
function renderAll(articles) {
    articlesList.innerHTML = '';
    articles.forEach(a => {
        articlesList.appendChild(renderArticle(a, false));
    });
    knownIds = new Set(articles.map(a => a.id));
    articleCount.textContent = `${articles.length} articles`;
}

// ── Prepend new articles, preserving scroll position ─────────────────────────
function prependNew(newArticles) {
    if (newArticles.length === 0) return;

    const savedScrollY = window.scrollY;

    // insert in reverse so newest stays on top
    [...newArticles].reverse().forEach(article => {
        const el = renderArticle(article, true);
        articlesList.insertBefore(el, articlesList.firstChild);
        knownIds.add(article.id);
    });

    // adjust scroll so viewport doesn't jump
    requestAnimationFrame(() => {
        const addedHeight = [...articlesList.children]
            .slice(0, newArticles.length)
            .reduce((sum, el) => sum + el.offsetHeight + 14, 0); // 14 = gap
        window.scrollTo({ top: savedScrollY + addedHeight, behavior: 'instant' });
    });
}

// ── Flash overlay: new articles animate in from center of viewport ────────────
const MAX_FLASH      = 4;
const FLASH_HOLD_MS  = 3400;   // how long cards stay visible
const FLASH_OUT_MS   = 550;    // duration of fly-out animation

function showFlashCards(newArticles) {
    document.getElementById('flashBackdrop')?.remove();
    document.getElementById('flashOverlay')?.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'flashBackdrop';
    backdrop.className = 'flash-backdrop';
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('visible'));

    const overlay = document.createElement('div');
    overlay.id = 'flashOverlay';
    overlay.className = 'flash-overlay';

    newArticles.slice(0, MAX_FLASH).forEach((article, i) => {
        const card = document.createElement('div');
        card.className = 'flash-card';
        const inDelay  = i * 80;
        const outDelay = FLASH_HOLD_MS + i * 40;
        card.style.animationDelay = `${inDelay}ms, ${outDelay}ms`;

        const badgeClass = sourceBadgeClass(article.source);
        card.innerHTML = `
            <div class="card-meta">
                <span class="source-badge ${badgeClass}">${escHtml(article.source)}</span>
                <span class="article-time">${formatTime(article.publishedAt)}</span>
                <span class="new-badge">NEW</span>
            </div>
            <div class="card-title">${escHtml(article.title)}</div>
        `;
        overlay.appendChild(card);
    });

    if (newArticles.length > MAX_FLASH) {
        const more = document.createElement('div');
        more.className = 'flash-more';
        more.style.animationDelay = `${MAX_FLASH * 80}ms, ${FLASH_HOLD_MS}ms`;
        more.textContent = `+ ${newArticles.length - MAX_FLASH} more new articles`;
        overlay.appendChild(more);
    }

    document.body.appendChild(overlay);

    // Fade backdrop out, then remove everything
    setTimeout(() => {
        backdrop.classList.remove('visible');
        setTimeout(() => { backdrop.remove(); overlay.remove(); }, 350);
    }, FLASH_HOLD_MS + FLASH_OUT_MS + 100);
}

// ── Keep banner wired for "N new" banner click → newest ──────────────────────
newBanner.addEventListener('click', () => {
    newBanner.classList.add('hidden');
    restartFromNewest();
});

// ── Fetch & update ──────────────────────────────────────────────────────────
async function fetchNews() {
    try {
        const resp = await fetch('/api/news');
        if (!resp.ok) return;
        const data = await resp.json();
        const articles = data.articles || [];

        if (knownIds.size === 0) {
            // First load
            renderAll(articles);
        } else {
            const newArticles = articles.filter(a => !knownIds.has(a.id));
            if (newArticles.length > 0) {
                showFlashCards(newArticles);
                prependNew(newArticles);
                articleCount.textContent = `${articles.length + newArticles.length} articles`;
            }
        }
    } catch (err) {
        console.warn('News fetch error:', err);
    }
}

// ── Initialise ───────────────────────────────────────────────────────────────
(async function init() {
    await fetchNews();
    startScroll();
    startCountdown();

    setInterval(async () => {
        await fetchNews();
        startCountdown();
    }, REFRESH_MS);
})();
