package com.scrollingnews.service;

import com.scrollingnews.model.FeedUpdateEvent;
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
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

@Service
public class NewsAggregatorService {

    private static final Logger log = LoggerFactory.getLogger(NewsAggregatorService.class);
    private static final int MAX_RECENT = 500;
    private static final int MAX_EVENTS = 500;

    private static final List<NewsSource> SOURCES = List.of(
            new NewsSource("BBC News",        "https://feeds.bbci.co.uk/news/rss.xml"),
            new NewsSource("BBC World",       "https://feeds.bbci.co.uk/news/world/rss.xml"),
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
            new NewsSource("Sky News",        "https://feeds.skynews.com/feeds/rss/home.xml"),
            new NewsSource("Fox News",        "https://moxie.foxnews.com/google-publisher/latest.xml"),
            new NewsSource("Engadget",        "https://www.engadget.com/rss.xml"),
            new NewsSource("ABC News",        "https://abcnews.go.com/abcnews/topstories"),
            new NewsSource("SMH News",        "https://www.smh.com.au/rss/feed.xml")
    );

    private record SequencedArticle(long seq, NewsArticle article) {}
    private record SourceFetchResult(NewsSource source, List<NewsArticle> articles) {}

    private final NewsFetcherService fetcher;
    private final ExecutorService fetchPool = Executors.newFixedThreadPool(10);

    private final Set<String> seenIds = ConcurrentHashMap.newKeySet();
    private final List<SequencedArticle> recentArticles = new ArrayList<>();
    private final List<FeedUpdateEvent> feedUpdateEvents = new ArrayList<>();
    private final AtomicLong latestSeq = new AtomicLong(0);
    private final AtomicInteger sourcesRead = new AtomicInteger(0);

    private volatile boolean initialized = false;
    private volatile long nextPollAt = 0;

    public NewsAggregatorService(NewsFetcherService fetcher) {
        this.fetcher = fetcher;
    }

    @Scheduled(fixedRate = 30000, initialDelay = 0)
    public void pollAll() {
        log.info("Poll cycle starting");
        nextPollAt = System.currentTimeMillis() + 30000;

        List<CompletableFuture<SourceFetchResult>> futures = SOURCES.stream()
                .map(source -> CompletableFuture.supplyAsync(() -> {
                    List<NewsArticle> result = fetcher.fetch(source);
                    sourcesRead.incrementAndGet();
                    return new SourceFetchResult(source, result);
                }, fetchPool))
                .toList();

        long detectedAt = System.currentTimeMillis();
        List<NewsArticle> newArticles = new ArrayList<>();
        List<FeedUpdateEvent> newEvents = new ArrayList<>();

        for (CompletableFuture<SourceFetchResult> f : futures) {
            try {
                SourceFetchResult result = f.get(30, TimeUnit.SECONDS);
                int count = 0;
                for (NewsArticle article : result.articles()) {
                    if (article.id() != null && seenIds.add(article.id())) {
                        newArticles.add(article);
                        count++;
                    }
                }
                if (count > 0) {
                    newEvents.add(new FeedUpdateEvent(result.source().name(), detectedAt, count));
                }
            } catch (Exception e) {
                log.debug("Future timed out or failed: {}", e.getMessage());
            }
        }

        if (!newArticles.isEmpty()) {
            log.info("Poll cycle complete — {} new articles found", newArticles.size());
        }

        synchronized (this) {
            feedUpdateEvents.addAll(newEvents);
            while (feedUpdateEvents.size() > MAX_EVENTS) {
                feedUpdateEvents.remove(0);
            }
            for (NewsArticle article : newArticles) {
                recentArticles.add(new SequencedArticle(latestSeq.incrementAndGet(), article));
            }
            while (recentArticles.size() > MAX_RECENT) {
                recentArticles.remove(0);
            }
            initialized = true;
        }
    }

    public synchronized StatusResponse getStatus(Long since) {
        int totalLoaded = seenIds.size();

        if (!initialized) {
            return new StatusResponse("INITIALIZING", sourcesRead.get(), SOURCES.size(),
                    Collections.emptyList(), nextPollAt, latestSeq.get(), totalLoaded);
        }

        // New client: return baseline seq so they only receive future articles
        if (since == null) {
            return new StatusResponse("IDLE", SOURCES.size(), SOURCES.size(),
                    Collections.emptyList(), nextPollAt, latestSeq.get(), totalLoaded);
        }

        List<NewsArticle> articles = recentArticles.stream()
                .filter(sa -> sa.seq() > since)
                .map(SequencedArticle::article)
                .collect(Collectors.toList());

        String state = articles.isEmpty() ? "IDLE" : "ARTICLES_READY";
        return new StatusResponse(state, SOURCES.size(), SOURCES.size(),
                articles, nextPollAt, latestSeq.get(), totalLoaded);
    }

    public synchronized List<FeedUpdateEvent> getFeedUpdates() {
        return new ArrayList<>(feedUpdateEvents);
    }

    public int getTotalSources() {
        return SOURCES.size();
    }
}
