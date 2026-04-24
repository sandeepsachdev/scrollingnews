package com.scrollingnews.service;

import com.scrollingnews.model.NewsArticle;
import com.scrollingnews.model.NewsSource;
import com.scrollingnews.model.StatusResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class NewsAggregatorService {

    private static final Logger log = LoggerFactory.getLogger(NewsAggregatorService.class);

    private static final List<NewsSource> SOURCES = List.of(
            new NewsSource("BBC News",        "https://feeds.bbci.co.uk/news/rss.xml"),
            new NewsSource("BBC World",       "https://feeds.bbci.co.uk/news/world/rss.xml"),
            new NewsSource("Reuters",         "https://feeds.reuters.com/reuters/topNews"),
            new NewsSource("CNN",             "http://rss.cnn.com/rss/edition.rss"),
            new NewsSource("NPR",             "https://feeds.npr.org/1001/rss.xml"),
            new NewsSource("The Guardian",    "https://www.theguardian.com/world/rss"),
            new NewsSource("Al Jazeera",      "https://www.aljazeera.com/xml/rss/all.xml"),
            new NewsSource("TechCrunch",      "https://techcrunch.com/feed/"),
            new NewsSource("Ars Technica",    "https://feeds.arstechnica.com/arstechnica/index"),
            new NewsSource("The Verge",       "https://www.theverge.com/rss/index.xml"),
            new NewsSource("Wired",           "https://www.wired.com/feed/rss"),
            new NewsSource("Hacker News",     "https://news.ycombinator.com/rss"),
            new NewsSource("NY Times",        "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"),
            new NewsSource("Washington Post", "https://feeds.washingtonpost.com/rss/national"),
            new NewsSource("CNBC",            "https://www.cnbc.com/id/100003114/device/rss/rss.html"),
            new NewsSource("Forbes",          "https://www.forbes.com/real-time/feed2/"),
            new NewsSource("Sky News",        "https://feeds.skynews.com/feeds/rss/home.xml"),
            new NewsSource("Fox News",        "https://moxie.foxnews.com/google-publisher/latest.xml"),
            new NewsSource("Engadget",        "https://www.engadget.com/rss.xml"),
            new NewsSource("ABC News",        "https://abcnews.go.com/abcnews/topstories")
    );

    private final NewsFetcherService fetcher;
    private final ExecutorService fetchPool = Executors.newFixedThreadPool(10);

    private final Set<String> seenIds = ConcurrentHashMap.newKeySet();
    private final List<NewsArticle> pendingArticles = new ArrayList<>();
    private List<NewsArticle> activeDisplay = null;

    private final AtomicInteger firstRoundProgress = new AtomicInteger(0);
    private volatile boolean initialized = false;
    private volatile long nextPollAt = 0;
    private final AtomicInteger pollCycle = new AtomicInteger(0);

    public NewsAggregatorService(NewsFetcherService fetcher) {
        this.fetcher = fetcher;
    }

    @Scheduled(fixedRate = 60000, initialDelay = 0)
    public void pollAll() {
        boolean isFirstRound = !initialized;
        log.info("Poll cycle starting (firstRound={})", isFirstRound);
        nextPollAt = System.currentTimeMillis() + 60000;

        List<CompletableFuture<List<NewsArticle>>> futures = SOURCES.stream()
                .map(source -> CompletableFuture.supplyAsync(() -> {
                    List<NewsArticle> result = fetcher.fetch(source);
                    if (isFirstRound) {
                        firstRoundProgress.incrementAndGet();
                    }
                    return result;
                }, fetchPool))
                .toList();

        List<NewsArticle> newArticles = new ArrayList<>();
        for (CompletableFuture<List<NewsArticle>> f : futures) {
            try {
                f.get(30, TimeUnit.SECONDS).forEach(article -> {
                    if (article.id() != null && seenIds.add(article.id())) {
                        newArticles.add(article);
                    }
                });
            } catch (Exception e) {
                log.debug("Future timed out or failed: {}", e.getMessage());
            }
        }

        log.info("Poll cycle complete — {} new articles found", newArticles.size());

        synchronized (this) {
            if (!initialized) {
                initialized = true;
                firstRoundProgress.set(SOURCES.size());
            }
            if (!newArticles.isEmpty()) {
                pendingArticles.addAll(newArticles);
            }
        }
        pollCycle.incrementAndGet();
    }

    public synchronized StatusResponse getStatus() {
        int cycle = pollCycle.get();
        int totalLoaded = seenIds.size();
        int unseenCount = pendingArticles.size();

        if (!initialized) {
            return new StatusResponse("INITIALIZING", firstRoundProgress.get(), SOURCES.size(),
                    Collections.emptyList(), nextPollAt, cycle, totalLoaded, unseenCount);
        }

        // Promote pending to activeDisplay when nothing is currently being shown
        if (activeDisplay == null && !pendingArticles.isEmpty()) {
            activeDisplay = new ArrayList<>(pendingArticles);
            pendingArticles.clear();
            unseenCount = 0;
        }

        if (activeDisplay != null) {
            return new StatusResponse("ARTICLES_READY", SOURCES.size(), SOURCES.size(),
                    activeDisplay, nextPollAt, cycle, totalLoaded, unseenCount);
        }

        return new StatusResponse("IDLE", SOURCES.size(), SOURCES.size(),
                Collections.emptyList(), nextPollAt, cycle, totalLoaded, unseenCount);
    }

    public synchronized void markDisplayComplete() {
        activeDisplay = null;
        log.info("Display cycle complete");
    }

    public int getTotalSources() {
        return SOURCES.size();
    }
}
