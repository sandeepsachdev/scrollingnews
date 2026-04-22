package com.scrollingnews;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@TestPropertySource(properties = "spring.main.allow-bean-definition-overriding=true")
class ScrollingNewsApplicationTests {

    @Test
    void contextLoads() {
    }
}
