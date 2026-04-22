# Scrolling News

A Spring Boot news aggregator that displays live articles from 15+ free sources as a slowly auto-scrolling feed. New articles are animated when fetched, the feed refreshes every 2 minutes, and clicking any article opens the original source in a new tab.

## Features

- **Auto-scrolling feed** — articles scroll down the page continuously at adjustable speed
- **Live refresh** — news is fetched every 2 minutes in the background with a countdown timer
- **New article animations** — freshly fetched articles slide in at the top with a gold glow and a `NEW` badge; a dismissible banner shows how many arrived
- **Pause / Resume** — stop and restart scrolling without losing your position
- **Speed control** — slow down or speed up the scroll rate on the fly
- **Newest first** — articles are sorted by publication date, most recent at the top
- **Date & time** — each article shows both a relative time ("2h ago") and the full date/time
- **Click to read** — clicking any article opens the original source in a new tab
- **Source badges** — colour-coded per outlet (BBC, Guardian, Hacker News, Reddit, etc.)
- **15+ sources** — aggregates RSS feeds and APIs, no API keys required

## News Sources

| Source | Type |
|---|---|
| BBC News / BBC World | RSS |
| NPR | RSS |
| The Guardian | RSS |
| Al Jazeera | RSS |
| Sky News | RSS |
| ABC News | RSS |
| CBS News | RSS |
| CNBC | RSS |
| Deutsche Welle | RSS |
| Yahoo News | RSS |
| Reuters | RSS |
| Reddit r/news | RSS |
| Reddit r/worldnews | RSS |
| Reddit r/technology | RSS |
| Hacker News | JSON API |

## Tech Stack

- **Java 17** + **Spring Boot 3.2**
- **Rome** library for RSS/Atom feed parsing
- **Thymeleaf** for the single-page HTML template
- **Vanilla JS** (no framework) with `requestAnimationFrame` for smooth scrolling
- **CSS keyframe animations** for new-article effects

## Running Locally

```bash
# Build
mvn clean package -DskipTests

# Run
java -jar target/scrollingnews-0.0.1-SNAPSHOT.jar

# Open
open http://localhost:8080
```

Requires Java 17+ and Maven 3.8+.

## Deploying to Render

The repo includes a `render.yaml` and a multi-stage `Dockerfile`.

1. Push this repo to GitHub
2. In [Render](https://render.com), click **New → Web Service**
3. Connect the repository and select **Docker** as the environment
4. Render detects `render.yaml` automatically — click **Deploy**

No environment variables are required. Render injects a `PORT` variable which the app reads via `server.port=${PORT:8080}`.

## Project Structure

```
src/main/
├── java/com/scrollingnews/
│   ├── ScrollingNewsApplication.java   # Entry point + scheduling
│   ├── controller/NewsController.java  # GET / and GET /api/news
│   ├── model/NewsArticle.java          # Article data model
│   └── service/
│       ├── NewsAggregatorService.java  # Cache + 2-min refresh scheduler
│       ├── RssFeedService.java         # Parses all RSS/Atom feeds
│       └── HackerNewsService.java      # Hacker News Firebase API
└── resources/
    ├── application.properties
    ├── templates/index.html            # Page structure
    └── static/
        ├── css/style.css               # Dark theme + animations
        └── js/app.js                   # Scroll, refresh, render logic
```

## API

`GET /api/news` returns JSON:

```json
{
  "count": 312,
  "lastRefreshed": 1745320000000,
  "articles": [
    {
      "id": "a1b2c3...",
      "title": "Article headline",
      "description": "Short summary...",
      "url": "https://...",
      "source": "BBC News",
      "publishedAt": "2026-04-22T14:30:00"
    }
  ]
}
```
