package com.scrollingnews.controller;

import com.scrollingnews.model.StatusResponse;
import com.scrollingnews.service.NewsAggregatorService;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
public class NewsController {

    private final NewsAggregatorService aggregator;

    public NewsController(NewsAggregatorService aggregator) {
        this.aggregator = aggregator;
    }

    @GetMapping("/")
    public String index() {
        return "index";
    }

    @GetMapping("/api/status")
    @ResponseBody
    public StatusResponse getStatus(@RequestParam(required = false) Long since) {
        return aggregator.getStatus(since);
    }
}
