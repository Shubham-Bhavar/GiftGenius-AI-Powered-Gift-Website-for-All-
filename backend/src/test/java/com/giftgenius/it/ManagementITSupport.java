package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Starts the real servers, the API and the management port on random ports, against the integration-test MySQL, so
 * Actuator security is tested over real HTTP as Docker's health check and a Prometheus scraper would see it.
 *
 * <p>Unlike {@link AbstractIT} it doesn't clean the database (other test classes keep their cached contexts), uses
 * the same admin account, keeps the outbox sender off, and closes its context afterwards so none of its scheduled jobs
 * outlive the class.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@DirtiesContext
@ExtendWith(OutputCaptureExtension.class)
abstract class ManagementITSupport {

    protected static final JsonMapper JSON = JsonMapper.builder().build();
    /** Actuator paths that must never answer 200 on the management port. */
    protected static final List<String> CLOSED = List.of("/actuator/info", "/actuator/env", "/actuator/beans",
            "/actuator/configprops", "/actuator/metrics", "/actuator/loggers", "/actuator/heapdump",
            "/actuator/threaddump", "/actuator/mappings", "/actuator/flyway", "/actuator/scheduledtasks",
            "/actuator/health/db", "/actuator/health/diskSpace", "/actuator/nothing-here");

    @LocalServerPort
    protected int apiPort;

    @LocalManagementPort
    protected int managementPort;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @DynamicPropertySource
    static void managementPort(DynamicPropertyRegistry r) {
        commonProperties(r);
        r.add("management.server.port", () -> "0");
    }

    /** What every management test context needs; the management port is set by each. */
    static void commonProperties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", () -> env("IT_DB_URL",
                "jdbc:mysql://localhost:3306/giftgenius_test?serverTimezone=UTC&characterEncoding=UTF-8"
                        + "&allowPublicKeyRetrieval=true"));
        r.add("spring.datasource.username", () -> env("IT_DB_USERNAME", "giftgenius"));
        r.add("spring.datasource.password", () -> env("IT_DB_PASSWORD", ""));
        r.add("app.security.jwt-secret", () -> "integration-test-secret-that-is-long-enough-1234");
        r.add("app.security.cookie-secure", () -> "false");
        r.add("app.admin.email", () -> AbstractIT.ADMIN_EMAIL);
        r.add("app.admin.password", () -> AbstractIT.ADMIN_PASSWORD);
        r.add("app.mail.outbox.sender-enabled", () -> "false");
        r.add("app.payment.razorpay-enabled", () -> "false");
        r.add("app.geo.enabled", () -> "false");
    }

    protected HttpResponse<String> get(int port, String path, String authorization) throws Exception {
        return send("GET", port, path, authorization);
    }

    protected HttpResponse<String> send(String method, int port, String path, String authorization)
            throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(10));
        if (method.equals("POST")) {
            b.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString("{}"));
        } else {
            b.GET();
        }
        if (authorization != null) {
            b.header("Authorization", authorization);
        }
        return http.send(b.build(), BodyHandlers.ofString());
    }

    /** A health response that says UP and nothing else: no components, no details. */
    protected static void assertStatusOnlyUp(HttpResponse<String> r) {
        assertThat(r.statusCode()).as(r.uri().getPath()).isEqualTo(200);
        JsonNode body = JSON.readTree(r.body());
        assertThat(body.propertyNames()).as("only a status").containsExactly("status");
        assertThat(body.path("status").asString()).isEqualTo("UP");
    }

    /** Refused for want of the token: 401, a Bearer challenge, and no metrics or health in the body. */
    protected static void assertRefused(HttpResponse<String> r) {
        assertThat(r.statusCode()).as(r.uri().getPath()).isEqualTo(401);
        assertThat(r.headers().firstValue("WWW-Authenticate")).hasValue("Bearer");
        assertNoActuatorData(r);
    }

    protected static void assertNoActuatorData(HttpResponse<String> r) {
        assertThat(r.body()).as(r.uri().getPath()).doesNotContain("giftgenius_").doesNotContain("jvm_")
                .doesNotContain("\"UP\"");
    }

    private static String env(String name, String fallback) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? fallback : v;
    }
}
