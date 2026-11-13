package com.giftgenius.it;

import static com.giftgenius.it.RateLimitClientAddressIT.LIMIT;
import static com.giftgenius.it.RateLimitClientAddressIT.signIns;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Behind a trusted proxy that appends the real address (this machine, a loopback address, is trusted by default): the
 * right-most address that isn't a trusted proxy is the client, so a client can't choose its own by prepending to the
 * header. Over real HTTP through Tomcat; the sign-in limit is 3 per minute here.
 */
class RateLimitBehindProxyIT extends ManagementITSupport {

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("app.rate-limit.auth-per-minute", () -> String.valueOf(LIMIT));
    }

    @Test
    void aClientCantChooseItsAddressByPrependingToTheHeader() throws Exception {
        // The client sends any X-Forwarded-For it likes; the proxy appends the address the client really came from.
        List<Integer> codes = signIns(apiPort, LIMIT + 2, "/api/auth/login",
                "X-Forwarded-For", "10.9.{n}.1, 198.51.100.{n}, 203.0.113.9");
        assertThat(codes.subList(0, LIMIT)).containsOnly(401);
        assertThat(codes.subList(LIMIT, codes.size())).as("one client, one limit").containsOnly(429);
    }

    @Test
    void differentRealClientsBehindTheProxyHaveTheirOwnLimits() throws Exception {
        assertThat(signIns(apiPort, LIMIT, "/api/auth/login", "X-Forwarded-For", "203.0.113.20")).containsOnly(401);
        assertThat(signIns(apiPort, 1, "/api/auth/login", "X-Forwarded-For", "203.0.113.21"))
                .as("another client behind the same proxy").containsOnly(401);
    }
}
