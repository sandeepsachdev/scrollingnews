# Scrolling News

A Spring Boot news aggregator that polls 20 RSS feeds every minute and displays new headlines as a slowly scrolling feed on a black cinematic background.

## Features

- **60-second polling** — 20 sources fetched in parallel; new articles deduplicated across cycles
- **First-load blank screen** — nothing is shown when the page opens; only articles that arrive in the first refresh after page load are ever displayed
- **Auto-play / Pause** — by default articles scroll automatically as soon as they arrive; pressing **Pause** (bottom-right) queues them behind a *Show N articles* button instead
- **Button-gated display (paused mode)** — queued articles accumulate across multiple refresh cycles and the button count updates live
- **Replay** — after each scroll a *Replay last N articles* button appears at the bottom so you can re-watch the previous batch
- **Live top bar** — always shows total articles loaded, unseen count, and a live countdown to the next refresh
- **Click to read** — every article card is a link that opens the original source in a new tab
- **Date & time** — each article shows its publication date and time (`24 Apr 2026  14:32`)
- **Dark cinematic theme** — black background, gradient viewport mask, monospace UI chrome

## News Sources

BBC News · BBC World · Reuters · CNN · NPR · The Guardian · Al Jazeera · TechCrunch · Ars Technica · The Verge · Wired · Hacker News · NY Times · Washington Post · CNBC · Forbes · Sky News · Fox News · Engadget · ABC News

All sources are public RSS feeds — no API keys required.

## Tech Stack

- **Java 17** + **Spring Boot 3.2**
- **Rome 2.1** for RSS / Atom feed parsing
- **Thymeleaf** for the HTML template
- **Vanilla JS** — `requestAnimationFrame` scroll, `fetch` polling, no framework
- **CSS** — mask gradients, monospace chrome, transition animations

## Running Locally

```bash
mvn clean package -DskipTests
java -jar target/scrollingnews-0.0.1-SNAPSHOT.jar
# open http://localhost:8080
```

Requires Java 17+ and Maven 3.8+.

## Deploying to Render

The repo includes a `render.yaml` and `Dockerfile`.

1. Push to GitHub
2. In [Render](https://render.com) → **New → Web Service**
3. Connect the repo, select **Docker**
4. Render detects `render.yaml` — click **Deploy**

No environment variables needed. `PORT` is injected automatically.

## Project Structure

```
src/main/
├── java/com/scrollingnews/
│   ├── ScrollingNewsApplication.java      # Entry point, @EnableScheduling
│   ├── controller/NewsController.java     # GET /   GET /api/status   POST /api/complete
│   ├── model/
│   │   ├── NewsArticle.java               # id, title, description, link, source, publishedAt
│   │   ├── NewsSource.java                # name + url
│   │   └── StatusResponse.java            # state, counts, articles, nextPollAt, pollCycle
│   └── service/
│       ├── NewsAggregatorService.java     # Scheduler, state machine, deduplication
│       └── NewsFetcherService.java        # ROME RSS parser with connection timeouts
└── resources/
    ├── application.properties
    ├── templates/index.html
    └── static/
        ├── css/style.css                  # Dark theme, button styles, viewport mask
        └── js/app.js                      # Poll loop, clientQueue, pause logic, scroll animation
```

## API

`GET /api/status`

```json
{
  "state": "IDLE",
  "sourcesRead": 20,
  "totalSources": 20,
  "articles": [],
  "nextPollAt": 1745320060000,
  "pollCycle": 4,
  "totalLoaded": 1234,
  "unseenCount": 0
}
```

States: `INITIALIZING` → `ARTICLES_READY` → `IDLE`

`POST /api/complete` — called by the frontend when it has consumed a batch of articles, clearing `activeDisplay` on the backend.

---

## Prompts Used to Build This App

The following sequence of prompts (given to Claude Code) produced this application from scratch.

---

**1 — Initial build**

> Completely delete all code for this project. Start again with a brand new Spring Boot project. The project will read many available news sources every minute. Initially do not show any of the news items. After the first time all sources have been read then show all new items after this time slowly scrolling down the screen. Once all items are shown make the items disappear from the screen. Then show updates again the next time new updates are found.

---

**2 — Waiting state and refresh countdown**

> Show the text waiting for news items when no news visible. Show a countdown to the next refresh.

---

**3 — Clickable articles**

> Make the articles clickable so they can open original news article.

---

**4 — Suppress articles on first page load**

> There should be no news shown the first time news is loaded on the page. Only from the first refresh.

---

**5 — Persistent top bar with stats**

> Also at the top at any time show the total number of articles loaded and how many are unseen. Until the first refresh appears just show total loaded initially. Show the countdown to refresh on the top of screen.

---

**6 — Visibility and correctness fixes**

> Doesn't seem to be working. Make the text up the top more visible it's too dark. Once it starts showing items it shows all items not just the ones received after the first refresh.

---

**7 — Replay last batch**

> Provide a way to redisplay the last updates.

---

**8 — Brighter buttons**

> Make the buttons much brighter.

---

**9 — Pause / resume with auto-play**

> Add a pause and resume toggle. Only display the show n articles when pause is activated otherwise show articles straight away.

---

**10 — Layout fix**

> The pause and resume is overlapping the time to refresh counter.

---

**11 — This file**

> Add prompts which could recreate this app in the readme.
