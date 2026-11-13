package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * The sign-in limit over real HTTP, through the real web server (Tomcat with {@code forward-headers-strategy: native}),
 * against the ways a client used to pick its own address or dodge the limit: its own {@code X-Forwarded-For}, a
 * {@code Forwarded} header, {@code X-Forwarded-Prefix}, and a percent-encoded path. The limit is 3 per minute here.
 *
 * <p>Here the API is reached directly, from an address that isn't a trusted proxy, so forwarded headers are ignored.
 * {@link RateLimitBehindProxyIT} covers a trusted proxy.
 */
class RateLimitClientAddressIT extends ManagementITSupport {

    static final int LIMIT = 3;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("app.rate-limit.auth-per-minute", () -> String.valueOf(LIMIT));
        // No address is a trusted proxy here, not even this machine's: as if the API were reached directly.
        r.add("server.tomcat.remoteip.internal-proxies", () -> "192\\.0\\.2\\.250");
    }

    /**
     * Wrong-password sign-ins, each with the given extra headers ({@code {n}}: the attempt's number, {@code {r}}: a
     * random value) and path; returns the status codes.
     */
    static List<Integer> signIns(int port, int count, String path, String... headerPairs) throws Exception {
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        List<Integer> codes = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                    .timeout(Duration.ofSeconds(20)).header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            "{\"email\":\"nobody-" + i + "@it.test\",\"password\":\"wrong-password-1\"}"));
            for (int h = 0; h < headerPairs.length; h += 2) {
                b.header(headerPairs[h], headerPairs[h + 1].replace("{n}", String.valueOf(i))
                        .replace("{r}", UUID.randomUUID().toString().substring(0, 8)));
            }
            codes.add(http.send(b.build(), HttpResponse.BodyHandlers.discarding()).statusCode());
        }
        return codes;
    }

    @Test
    void noHeaderOrPathTrickGetsPastTheSignInLimit() throws Exception {
        List<Integer> codes = new ArrayList<>(signIns(apiPort, LIMIT, "/api/auth/login",
                "X-Forwarded-For", "203.0.113.{n}"));
        assertThat(codes).as("the first attempts are answered").containsOnly(401);
        codes = new ArrayList<>();
        codes.addAll(signIns(apiPort, 1, "/api/auth/login", "X-Forwarded-For", "198.51.100.{r}"));
        codes.addAll(signIns(apiPort, 1, "/api/auth/login", "Forwarded", "for=198.51.100.77"));
        codes.addAll(signIns(apiPort, 1, "/api/auth/login", "X-Forwarded-Prefix", "/elsewhere"));
        codes.addAll(signIns(apiPort, 1, "/api/auth/%6cogin"));
        codes.addAll(signIns(apiPort, 1, "/api/auth/login", "X-Real-IP", "198.51.100.88"));
        assertThat(codes).as("every further attempt is refused, whatever it claims").containsOnly(429);
    }
}
