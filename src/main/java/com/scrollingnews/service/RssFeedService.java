package com.scrollingnews.service;

import com.rometools.rome.feed.synd.SyndEntry;
import com.rometools.rome.feed.synd.SyndFeed;
import com.rometools.rome.io.SyndFeedInput;
import com.rometools.rome.io.XmlReader;
import com.scrollingnews.model.NewsArticle;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URL;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

@Service
public class RssFeedService {

    private static final Logger log = LoggerFactory.getLogger(RssFeedService.class);

    private static final List<String[]> FEEDS = List.of(
        new String[]{"BBC News",        "http://feeds.bbci.co.uk/news/rss.xml"},
        new String[]{"BBC World",       "http://feeds.bbci.co.uk/news/world/rss.xml"},
        new String[]{"NPR",             "https://feeds.npr.org/1001/rss.xml"},
        new String[]{"The Guardian",    "https://www.theguardian.com/world/rss"},
        new String[]{"Al Jazeera",      "https://www.aljazeera.com/xml/rss/all.xml"},
        new String[]{"Sky News",        "https://feeds.skynews.com/feeds/rss/home.xml"},
        new String[]{"ABC News",        "https://abcnews.go.com/abcnews/topstories"},
        new String[]{"CBS News",        "https://www.cbsnews.com/latest/rss/main"},
        new String[]{"CNBC",            "https://www.cnbc.com/id/100003114/device/rss/rss.html"},
        new String[]{"Deutsche Welle",  "https://rss.dw.com/rdf/rss-en-all"},
        new String[]{"Yahoo News",      "https://news.yahoo.com/rss/"},
        new String[]{"Reuters",         "https://feeds.reuters.com/reuters/topNews"},
        new String[]{"Reddit News",     "https://www.reddit.com/r/news/.rss"},
        new String[]{"Reddit World",    "https://www.reddit.com/r/worldnews/.rss"},
        new String[]{"Reddit Tech",     "https://www.reddit.com/r/technology/.rss"}
    );

    public List<NewsArticle> fetchArticles() {
        List<NewsArticle> articles = new ArrayList<>();
        for (String[] feed : FEEDS) {
            try {
                articles.addAll(parseFeed(feed[0], feed[1]));
            } catch (Exception e) {
                log.warn("Failed to fetch feed {} ({}): {}", feed[0], feed[1], e.getMessage());
            }
        }
        return articles;
    }

    private List<NewsArticle> parseFeed(String sourceName, String feedUrl) throws Exception {
        List<NewsArticle> articles = new ArrayList<>();
        URLConnection conn = new URL(feedUrl).openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(10000);
        conn.setRequestProperty("User-Agent",
            "Mozilla/5.0 (compatible; ScrollingNewsBot/1.0)");

        SyndFeedInput input = new SyndFeedInput();
        try (XmlReader reader = new XmlReader(conn)) {
            SyndFeed feed = input.build(reader);
            for (SyndEntry entry : feed.getEntries()) {
                NewsArticle article = toArticle(entry, sourceName);
                if (article != null) {
                    articles.add(article);
                }
            }
        }
        return articles;
    }

    private NewsArticle toArticle(SyndEntry entry, String source) {
        String url = entry.getLink();
        if (url == null || url.isBlank()) return null;

        String title = entry.getTitle();
        if (title == null || title.isBlank()) return null;

        String description = "";
        if (entry.getDescription() != null) {
            description = stripHtml(entry.getDescription().getValue());
        } else if (!entry.getContents().isEmpty()) {
            description = stripHtml(entry.getContents().get(0).getValue());
        }
        description = truncate(description, 280);

        LocalDateTime publishedAt = toLocalDateTime(entry.getPublishedDate());
        if (publishedAt == null) publishedAt = toLocalDateTime(entry.getUpdatedDate());
        if (publishedAt == null) publishedAt = LocalDateTime.now();

        String id = sha1(url);
        return new NewsArticle(id, title.trim(), description, url.trim(), source, publishedAt);
    }

    private LocalDateTime toLocalDateTime(Date date) {
        if (date == null) return null;
        return date.toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime();
    }

    private String stripHtml(String html) {
        if (html == null) return "";
        return html.replaceAll("<[^>]+>", "")
                   .replaceAll("&amp;", "&")
                   .replaceAll("&lt;", "<")
                   .replaceAll("&gt;", ">")
                   .replaceAll("&quot;", "\"")
                   .replaceAll("&#39;", "'")
                   .replaceAll("&nbsp;", " ")
                   .replaceAll("\\s+", " ")
                   .trim();
    }

    private String truncate(String text, int maxLen) {
        if (text == null || text.length() <= maxLen) return text == null ? "" : text;
        return text.substring(0, maxLen).trim() + "...";
    }

    static String sha1(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(input.hashCode());
        }
    }
}
