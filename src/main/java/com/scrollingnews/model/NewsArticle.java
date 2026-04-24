package com.scrollingnews.model;

public record NewsArticle(
        String id,
        String title,
        String description,
        String link,
        String source,
        long publishedAt
) {}
