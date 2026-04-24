package com.scrollingnews.model;

import java.util.List;

public record StatusResponse(
        String state,
        int sourcesRead,
        int totalSources,
        List<NewsArticle> articles,
        long nextPollAt,
        int pollCycle
) {}
