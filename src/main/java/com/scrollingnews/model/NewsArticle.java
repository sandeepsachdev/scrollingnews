package com.scrollingnews.model;

import java.time.Instant;
import java.util.Objects;

public class NewsArticle {
    private String id;
    private String title;
    private String description;
    private String url;
    private String source;
    private Instant publishedAt;

    public NewsArticle(String id, String title, String description,
                       String url, String source, Instant publishedAt) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.url = url;
        this.source = source;
        this.publishedAt = publishedAt;
    }

    public String getId() { return id; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public String getUrl() { return url; }
    public String getSource() { return source; }
    public Instant getPublishedAt() { return publishedAt; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof NewsArticle)) return false;
        return Objects.equals(id, ((NewsArticle) o).id);
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
