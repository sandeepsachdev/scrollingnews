package com.scrollingnews.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.scrollingnews.model.NewsArticle;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class HackerNewsService {

    private static final Logger log = LoggerFactory.getLogger(HackerNewsService.class);
    private static final String HN_BASE = "https://hacker-news.firebaseio.com/v0";
    private static final int MAX_STORIES = 25;

    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(8))
        .build();
    private final ObjectMapper mapper = new ObjectMapper();

    public List<NewsArticle> fetchArticles() {
        List<NewsArticle> articles = new ArrayList<>();
        try {
            String body = get(HN_BASE + "/topstories.json");
            JsonNode ids = mapper.readTree(body);

            int count = Math.min(MAX_STORIES, ids.size());
            for (int i = 0; i < count; i++) {
                try {
                    long id = ids.get(i).asLong();
                    NewsArticle article = fetchItem(id);
                    if (article != null) articles.add(article);
                } catch (Exception e) {
                    log.debug("HN item fetch failed: {}", e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("Failed to fetch Hacker News top stories: {}", e.getMessage());
        }
        return articles;
    }

    private NewsArticle fetchItem(long id) throws IOException, InterruptedException {
        String body = get(HN_BASE + "/item/" + id + ".json");
        JsonNode item = mapper.readTree(body);

        if (item == null || item.isNull()) return null;
        String type = item.path("type").asText("");
        if (!"story".equals(type)) return null;

        String title = item.path("title").asText("").trim();
        if (title.isBlank()) return null;

        String url = item.path("url").asText("");
        if (url.isBlank()) {
            url = "https://news.ycombinator.com/item?id=" + id;
        }

        int score = item.path("score").asInt(0);
        int comments = item.path("descendants").asInt(0);
        String description = String.format("Score: %d points | %d comments | by %s",
            score, comments, item.path("by").asText("anonymous"));

        long unixTime = item.path("time").asLong(0);
        Instant publishedAt = unixTime > 0 ? Instant.ofEpochSecond(unixTime) : Instant.now();

        String articleId = RssFeedService.sha1(url);
        return new NewsArticle(articleId, title, description, url, "Hacker News", publishedAt);
    }

    private String get(String url) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .timeout(Duration.ofSeconds(10))
            .GET()
            .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        return response.body();
    }
}
