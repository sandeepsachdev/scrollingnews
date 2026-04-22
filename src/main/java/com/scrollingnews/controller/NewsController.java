package com.scrollingnews.controller;

import com.scrollingnews.model.NewsArticle;
import com.scrollingnews.service.NewsAggregatorService;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.List;
import java.util.Map;

@Controller
public class NewsController {

    private final NewsAggregatorService aggregatorService;

    public NewsController(NewsAggregatorService aggregatorService) {
        this.aggregatorService = aggregatorService;
    }

    @GetMapping("/")
    public String index() {
        return "index";
    }

    @GetMapping("/api/news")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> getNews() {
        List<NewsArticle> articles = aggregatorService.getArticles();
        return ResponseEntity.ok(Map.of(
            "articles", articles,
            "lastRefreshed", aggregatorService.getLastRefreshed(),
            "count", articles.size()
        ));
    }
}
