package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import tools.jackson.databind.JsonNode;

/**
 * Actuator on its own management port with a scrape token configured: the probes are open and status-only, metrics
 * need the token, everything else is closed, the API port serves no Actuator, and the API itself is unchanged.
 */
class ManagementSecurityIT extends ManagementITSupport {

    /** Generated per run: a test value, never a real token. */
    private static final String TOKEN = "it-" + UUID.randomUUID() + UUID.randomUUID();
    private static final String BEARER = "Bearer " + TOKEN;

    @DynamicPropertySource
    static void token(DynamicPropertyRegistry r) {
        r.add("app.management.metrics-scrape-token", () -> TOKEN);
    }

    @Test
    void livenessAndReadinessAreOpenWithoutCredentialsAndStatusOnly() throws Exception {
        assertStatusOnlyUp(get(managementPort, "/actuator/health/liveness", null));
        assertStatusOnlyUp(get(managementPort, "/actuator/health/readiness", null));
        // A wrong token on a probe doesn't stop it either.
        assertStatusOnlyUp(get(managementPort, "/actuator/health/readiness", "Bearer wrong"));
        // With the token they are still status only.
        assertStatusOnlyUp(get(managementPort, "/actuator/health/readiness", BEARER));
    }

    @Test
    void theDockerHealthCheckStillPasses() throws Exception {
        // backend/Dockerfile: wget -qO- http://127.0.0.1:9091/actuator/health/readiness | grep -q UP
        HttpResponse<String> r = get(managementPort, "/actuator/health/readiness", null);
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.body()).contains("UP");
    }

    @Test
    void metricsNeedTheRightToken() throws Exception {
        String path = "/actuator/prometheus";
        assertRefused(get(managementPort, path, null));
        assertRefused(get(managementPort, path, "Bearer "));
        assertRefused(get(managementPort, path, "Bearer"));
        assertRefused(get(managementPort, path, "Bearer wrong-token"));
        assertRefused(get(managementPort, path, BEARER + "x"));
        assertRefused(get(managementPort, path, "Bearer " + TOKEN.substring(1)));
        assertRefused(get(managementPort, path, TOKEN));
        assertRefused(get(managementPort, path, "Basic " + TOKEN));
        assertRefused(send("POST", managementPort, path, null));

        HttpResponse<String> ok = get(managementPort, path, BEARER);
        assertThat(ok.statusCode()).isEqualTo(200);
        assertThat(ok.headers().firstValue("Content-Type")).hasValueSatisfying(t -> assertThat(t).startsWith("text/plain"));
        assertThat(ok.body()).contains("giftgenius_email_outbox_emails").contains("jvm_memory_used_bytes");
        assertThat(get(managementPort, path, "bearer " + TOKEN).statusCode()).as("scheme in lower case").isEqualTo(200);
    }

    @Test
    void theOverallHealthAndTheEndpointListNeedTheToken() throws Exception {
        assertRefused(get(managementPort, "/actuator/health", null));
        assertRefused(get(managementPort, "/actuator/health", "Bearer wrong-token"));
        assertRefused(get(managementPort, "/actuator", null));
        assertRefused(send("POST", managementPort, "/actuator/health/readiness", null));

        // With the token: the status and the names of the probe groups, never components or details.
        HttpResponse<String> health = get(managementPort, "/actuator/health", BEARER);
        assertThat(health.statusCode()).isEqualTo(200);
        JsonNode overall = JSON.readTree(health.body());
        assertThat(overall.propertyNames()).containsExactlyInAnyOrder("status", "groups");
        assertThat(overall.path("status").asString()).isEqualTo("UP");
        assertThat(health.body()).doesNotContain("components").doesNotContain("details").doesNotContain("db");
        HttpResponse<String> links = get(managementPort, "/actuator", BEARER);
        assertThat(links.statusCode()).isEqualTo(200);
        JsonNode endpoints = JSON.readTree(links.body()).path("_links");
        assertThat(endpoints.propertyNames()).as("only health and prometheus are exposed").doesNotContain("info", "env",
                "beans", "heapdump").contains("health", "prometheus");
    }

    @Test
    void everythingElseUnderActuatorIsClosedEvenWithTheToken() throws Exception {
        for (String path : CLOSED) {
            for (String auth : new String[] { null, BEARER }) {
                HttpResponse<String> r = get(managementPort, path, auth);
                assertThat(r.statusCode()).as(path + (auth == null ? "" : " with the token")).isIn(401, 403, 404);
                assertNoActuatorData(r);
            }
        }
        HttpResponse<String> shutdown = send("POST", managementPort, "/actuator/shutdown", BEARER);
        assertThat(shutdown.statusCode()).isIn(401, 403, 404);
    }

    @Test
    void theApiPortServesNoActuator() throws Exception {
        String admin = adminAccessToken();
        for (String path : new String[] { "/actuator/prometheus", "/actuator/health/readiness",
                "/actuator/health/liveness", "/actuator/health", "/actuator" }) {
            HttpResponse<String> anonymous = get(apiPort, path, null);
            assertThat(anonymous.statusCode()).as(path + " anonymous").isEqualTo(401);
            assertNoActuatorData(anonymous);
            HttpResponse<String> withToken = get(apiPort, path, BEARER);
            assertThat(withToken.statusCode()).as(path + " with the metrics token").isEqualTo(401);
            assertNoActuatorData(withToken);
            HttpResponse<String> asAdmin = get(apiPort, path, "Bearer " + admin);
            assertThat(asAdmin.statusCode()).as(path + " as an admin").isEqualTo(404);
            assertNoActuatorData(asAdmin);
        }
    }

    @Test
    void apiRoutesAndSignInAreUnchanged() throws Exception {
        assertThat(get(apiPort, "/api/products", null).statusCode()).as("public catalogue").isEqualTo(200);
        assertThat(get(apiPort, "/api/orders", null).statusCode()).as("signed-in route").isEqualTo(401);
        assertThat(get(apiPort, "/api/admin/stats", null).statusCode()).as("admin route").isEqualTo(401);
        assertThat(get(apiPort, "/api/admin/stats", BEARER).statusCode()).as("the metrics token isn't a sign-in")
                .isEqualTo(401);
        String admin = adminAccessToken();
        assertThat(get(apiPort, "/api/admin/stats", "Bearer " + admin).statusCode()).isEqualTo(200);
        assertThat(get(apiPort, "/api/orders", "Bearer " + admin).statusCode()).isEqualTo(200);
        // The management port serves no API.
        assertThat(get(managementPort, "/api/products", null).statusCode()).isNotEqualTo(200);
    }

    @Test
    void theTokenIsNeverLogged(CapturedOutput output) throws Exception {
        get(managementPort, "/actuator/prometheus", BEARER);
        get(managementPort, "/actuator/prometheus", "Bearer wrong-token");
        assertThat(output.getAll()).doesNotContain(TOKEN).doesNotContain("METRICS_SCRAPE_TOKEN is not set");
    }

    private String adminAccessToken() throws Exception {
        HttpResponse<String> r = sendJson("/api/auth/login",
                "{\"email\":\"" + AbstractIT.ADMIN_EMAIL + "\",\"password\":\"" + AbstractIT.ADMIN_PASSWORD + "\"}");
        assertThat(r.statusCode()).as("admin sign-in").isEqualTo(200);
        return JSON.readTree(r.body()).path("accessToken").asString();
    }

    private HttpResponse<String> sendJson(String path, String json) throws Exception {
        java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder(
                java.net.URI.create("http://127.0.0.1:" + apiPort + path))
                .header("Content-Type", "application/json")
                .POST(java.net.http.HttpRequest.BodyPublishers.ofString(json)).build();
        return java.net.http.HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());
    }
}
