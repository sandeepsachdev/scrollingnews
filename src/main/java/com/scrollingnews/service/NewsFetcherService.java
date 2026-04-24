package com.scrollingnews.service;

import com.rometools.rome.feed.synd.SyndEntry;
import com.rometools.rome.feed.synd.SyndFeed;
import com.rometools.rome.io.SyndFeedInput;
import com.rometools.rome.io.XmlReader;
import com.scrollingnews.model.NewsArticle;
import com.scrollingnews.model.NewsSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class NewsFetcherService {

    private static final Logger log = LoggerFactory.getLogger(NewsFetcherService.class);

    public List<NewsArticle> fetch(NewsSource source) {
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(source.url()).openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(12000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (compatible; NewsAggregator/1.0)");
            conn.setRequestProperty("Accept", "application/rss+xml, application/atom+xml, text/xml, */*");

            try (XmlReader reader = new XmlReader(conn)) {
                SyndFeedInput input = new SyndFeedInput();
                SyndFeed feed = input.build(reader);
                return feed.getEntries().stream()
                        .map(e -> toArticle(e, source.name()))
                        .filter(a -> a.title() != null && !a.title().isBlank())
                        .collect(Collectors.toList());
            }
        } catch (Exception e) {
            log.warn("Failed to fetch {}: {}", source.name(), e.getMessage());
            return Collections.emptyList();
        }
    }

    private NewsArticle toArticle(SyndEntry entry, String sourceName) {
        String id = entry.getUri() != null && !entry.getUri().isBlank()
                ? entry.getUri()
                : entry.getLink();
        String description = "";
        if (entry.getDescription() != null && entry.getDescription().getValue() != null) {
            description = entry.getDescription().getValue();
        }
        long publishedAt = entry.getPublishedDate() != null
                ? entry.getPublishedDate().getTime()
                : System.currentTimeMillis();
        return new NewsArticle(id, entry.getTitle(), description, entry.getLink(), sourceName, publishedAt);
    }
}
