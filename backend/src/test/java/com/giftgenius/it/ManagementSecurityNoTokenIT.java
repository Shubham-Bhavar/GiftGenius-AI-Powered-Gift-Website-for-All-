package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** No scrape token configured (METRICS_SCRAPE_TOKEN unset or blank): metrics are refused to every caller. */
class ManagementSecurityNoTokenIT extends ManagementITSupport {

    @DynamicPropertySource
    static void noToken(DynamicPropertyRegistry r) {
        // Blank, as an unset or empty METRICS_SCRAPE_TOKEN gives (and whatever this machine's environment holds).
        r.add("app.management.metrics-scrape-token", () -> "   ");
    }

    @Test
    void metricsAreRefusedWhateverIsSent() throws Exception {
        for (String auth : new String[] { null, "Bearer", "Bearer ", "Bearer    ", "Bearer anything",
                "Bearer " + UUID.randomUUID() + UUID.randomUUID(), "Basic YTpi" }) {
            assertRefused(get(managementPort, "/actuator/prometheus", auth));
            assertRefused(get(managementPort, "/actuator/health", auth));
        }
    }

    @Test
    void theProbesStillWork() throws Exception {
        assertStatusOnlyUp(get(managementPort, "/actuator/health/liveness", null));
        assertStatusOnlyUp(get(managementPort, "/actuator/health/readiness", null));
    }

    @Test
    void theMissingTokenIsReportedAtStartup(CapturedOutput output) {
        assertThat(output.getAll()).contains("METRICS_SCRAPE_TOKEN is not set: Prometheus metrics are refused");
    }
}
