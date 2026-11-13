package com.giftgenius.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import com.giftgenius.TestProps;
import com.giftgenius.security.RateLimitFilter.Bucket;

class RateLimitFilterTest {

    private final RateLimitFilter filter = new RateLimitFilter(TestProps.defaults()); // ai 10, auth 20, public 30

    private MockHttpServletResponse call(String method, String path, String ip) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest(method, path);
        req.setRemoteAddr(ip);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, new MockFilterChain());
        return res;
    }

    @Test
    void classifiesEndpoints() {
        assertThat(RateLimitFilter.bucketFor("POST", "/api/ai/recommendations")).isEqualTo(Bucket.AI);
        assertThat(RateLimitFilter.bucketFor("POST", "/api/auth/login")).isEqualTo(Bucket.AUTH);
        assertThat(RateLimitFilter.bucketFor("POST", "/api/auth/password/forgot")).isEqualTo(Bucket.AUTH);
        assertThat(RateLimitFilter.bucketFor("POST", "/api/auth/refresh")).isEqualTo(Bucket.PUBLIC);
        assertThat(RateLimitFilter.bucketFor("GET", "/api/orders/track")).isEqualTo(Bucket.PUBLIC);
        assertThat(RateLimitFilter.bucketFor("POST", "/api/newsletter/subscribe")).isEqualTo(Bucket.PUBLIC);
        assertThat(RateLimitFilter.bucketFor("POST", "/api/contact")).isEqualTo(Bucket.PUBLIC);
        assertThat(RateLimitFilter.bucketFor("GET", "/api/products")).isNull();
        assertThat(RateLimitFilter.bucketFor("GET", "/api/auth/me")).isNull();
        assertThat(RateLimitFilter.bucketFor("POST", "/api/orders")).as("placing orders").isEqualTo(Bucket.PUBLIC);
        assertThat(RateLimitFilter.bucketFor("GET", "/api/orders")).isNull();
        assertThat(RateLimitFilter.bucketFor("POST", "/api/orders/GG-1/cancel")).isNull();
    }

    @Test
    void anEncodedPathCountsAsTheEndpointItReaches() throws Exception {
        for (int i = 0; i < 20; i++) {
            String path = i % 2 == 0 ? "/api/auth/login" : "/api/auth/%6cogin";
            assertThat(call("POST", path, "3.3.3.3").getStatus()).isEqualTo(200);
        }
        assertThat(call("POST", "/api/auth/%6Cogin", "3.3.3.3").getStatus()).isEqualTo(429);
        assertThat(call("POST", "/api/%61i/recommendations", "3.3.3.3").getStatus()).as("AI has its own bucket")
                .isEqualTo(200);
        MockHttpServletRequest encoded = new MockHttpServletRequest("POST", "/api/%61i/recommendations");
        assertThat(RateLimitFilter.pathOf(encoded)).isEqualTo("/api/ai/recommendations");
    }

    @Test
    void aFloodOfNewClientsSharesOneOverflowWindowInsteadOfGrowingMemory() {
        filter.setClock(Clock.fixed(Instant.parse("2026-01-01T10:00:05Z"), ZoneOffset.UTC));
        for (int i = 0; i < RateLimitFilter.MAX_TRACKED; i++) {
            filter.tryAcquire("AUTH", "client-" + i, 20);
        }
        assertThat(filter.trackedWindows()).isEqualTo(RateLimitFilter.MAX_TRACKED);
        for (int i = 0; i < 20; i++) {
            assertThat(filter.tryAcquire("AUTH", "newcomer-" + i, 20)).isTrue();
        }
        assertThat(filter.tryAcquire("AUTH", "newcomer-x", 20)).as("the overflow window is limited too").isFalse();
        assertThat(filter.trackedWindows()).isEqualTo(RateLimitFilter.MAX_TRACKED + 1);
        assertThat(filter.tryAcquire("AUTH", "client-7", 20)).as("known clients keep their own window").isTrue();
    }

    @Test
    void blocksAfterLimitPerIpAndBucket() throws Exception {
        for (int i = 0; i < 10; i++) {
            assertThat(call("POST", "/api/ai/recommendations", "1.1.1.1").getStatus()).isEqualTo(200);
        }
        MockHttpServletResponse blocked = call("POST", "/api/ai/recommendations", "1.1.1.1");
        assertThat(blocked.getStatus()).isEqualTo(429);
        assertThat(blocked.getHeader("Retry-After")).isEqualTo("60");

        // Other IPs and other buckets are unaffected.
        assertThat(call("POST", "/api/ai/recommendations", "2.2.2.2").getStatus()).isEqualTo(200);
        assertThat(call("POST", "/api/auth/login", "1.1.1.1").getStatus()).isEqualTo(200);
        // Unlimited endpoints pass straight through.
        assertThat(call("GET", "/api/products", "1.1.1.1").getStatus()).isEqualTo(200);
    }

    @Test
    void windowResetsEachMinuteAndOldWindowsAreEvicted() {
        Instant t0 = Instant.parse("2026-01-01T10:00:05Z");
        filter.setClock(Clock.fixed(t0, ZoneOffset.UTC));
        for (int i = 0; i < 20; i++) {
            assertThat(filter.tryAcquire("AUTH", "9.9.9.9", 20)).isTrue();
        }
        assertThat(filter.tryAcquire("AUTH", "9.9.9.9", 20)).isFalse();

        filter.setClock(Clock.fixed(t0.plusSeconds(60), ZoneOffset.UTC));
        assertThat(filter.tryAcquire("AUTH", "9.9.9.9", 20)).isTrue();
        filter.tryAcquire("AUTH", "8.8.8.8", 20);
        filter.setClock(Clock.fixed(t0.plusSeconds(180), ZoneOffset.UTC));
        filter.evictOldWindows();
        assertThat(filter.trackedWindows()).isZero();
    }
}
