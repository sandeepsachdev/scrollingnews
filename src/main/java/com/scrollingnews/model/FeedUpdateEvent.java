package com.scrollingnews.model;

public record FeedUpdateEvent(String source, long detectedAt, int newArticles) {}