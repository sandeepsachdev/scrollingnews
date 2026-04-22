package com.scrollingnews.service;

import com.scrollingnews.model.NewsArticle;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class NewsAggregatorService {

    private static final Logger log = LoggerFactory.getLogger(NewsAggregatorService.class);

    private final RssFeedService rssFeedService;
    private final HackerNewsService hackerNewsService;

    private volatile List<NewsArticle> cachedArticles = new CopyOnWriteArrayList<>();
    private volatile long lastRefreshed = 0;

    public NewsAggregatorService(RssFeedService rssFeedService, HackerNewsService hackerNewsService) {
        this.rssFeedService = rssFeedService;
        this.hackerNewsService = hackerNewsService;
    }

    @PostConstruct
    public void init() {
        refresh();
    }

    @Scheduled(fixedDelay = 120_000)
    public void refresh() {
        log.info("Refreshing news feeds...");
        List<NewsArticle> articles = new ArrayList<>();

        try { articles.addAll(rssFeedService.fetchArticles()); }
        catch (Exception e) { log.warn("RSS fetch error: {}", e.getMessage()); }

        try { articles.addAll(hackerNewsService.fetchArticles()); }
        catch (Exception e) { log.warn("HN fetch error: {}", e.getMessage()); }

        articles = deduplicate(articles);
        articles.sort(Comparator.comparing(NewsArticle::getPublishedAt).reversed());

        cachedArticles = new CopyOnWriteArrayList<>(articles);
        lastRefreshed = System.currentTimeMillis();
        log.info("Cached {} articles", cachedArticles.size());
    }

    public List<NewsArticle> getArticles() {
        return cachedArticles;
    }

    public long getLastRefreshed() {
        return lastRefreshed;
    }

    private List<NewsArticle> deduplicate(List<NewsArticle> articles) {
        Set<String> seen = new LinkedHashSet<>();
        List<NewsArticle> result = new ArrayList<>();
        for (NewsArticle a : articles) {
            if (seen.add(a.getId())) {
                result.add(a);
            }
        }
        return result;
    }
}
