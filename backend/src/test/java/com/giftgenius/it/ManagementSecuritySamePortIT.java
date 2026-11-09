package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * MANAGEMENT_PORT set to the same port as PORT, which moves Actuator onto the API port: the same rules still hold
 * there, so this mistake can't make metrics public.
 */
@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext
class ManagementSecuritySamePortIT {

    private static final String TOKEN = "it-" + UUID.randomUUID() + UUID.randomUUID();

    @Autowired
    private MockMvc mvc;

    @DynamicPropertySource
    static void samePort(DynamicPropertyRegistry r) {
        ManagementITSupport.commonProperties(r);
        r.add("server.port", () -> "18080");
        r.add("management.server.port", () -> "18080");
        r.add("app.management.metrics-scrape-token", () -> TOKEN);
        // As if someone exposed more endpoints later: they must stay closed, even with the token.
        r.add("management.endpoints.web.exposure.include", () -> "health,prometheus,env,beans,loggers");
    }

    @Test
    void anEndpointExposedLaterIsStillClosedEvenWithTheToken() throws Exception {
        for (String path : new String[] { "/actuator/env", "/actuator/beans", "/actuator/loggers" }) {
            for (String auth : new String[] { null, "Bearer " + TOKEN }) {
                MvcResult r = mvc.perform(auth == null ? get(path) : get(path).header("Authorization", auth))
                        .andReturn();
                assertThat(r.getResponse().getStatus()).as(path + (auth == null ? "" : " with the token"))
                        .isEqualTo(401);
                assertThat(r.getResponse().getContentAsString()).doesNotContain("propertySources")
                        .doesNotContain("contexts").doesNotContain("levels");
            }
        }
    }

    @Test
    void metricsNeedTheTokenOnTheApiPortToo() throws Exception {
        for (String auth : new String[] { null, "Bearer ", "Bearer wrong-token", TOKEN }) {
            MvcResult r = mvc.perform(auth == null ? get("/actuator/prometheus")
                    : get("/actuator/prometheus").header("Authorization", auth))
                    .andExpect(status().isUnauthorized()).andExpect(header().string("WWW-Authenticate", "Bearer"))
                    .andReturn();
            assertThat(r.getResponse().getContentAsString()).doesNotContain("giftgenius_");
        }
        String metrics = mvc.perform(get("/actuator/prometheus").header("Authorization", "Bearer " + TOKEN))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(metrics).contains("giftgenius_email_outbox_emails");
    }

    @Test
    void probesStayOpenAndStatusOnlyAndTheRestIsClosed() throws Exception {
        for (String probe : new String[] { "/actuator/health/liveness", "/actuator/health/readiness" }) {
            String body = mvc.perform(get(probe)).andExpect(status().isOk()).andReturn().getResponse()
                    .getContentAsString();
            assertThat(ManagementITSupport.JSON.readTree(body).propertyNames()).containsExactly("status");
        }
        mvc.perform(get("/actuator/health")).andExpect(status().isUnauthorized());
        mvc.perform(post("/actuator/health/readiness")).andExpect(status().isUnauthorized());
        for (String path : ManagementITSupport.CLOSED) {
            int code = mvc.perform(get(path).header("Authorization", "Bearer " + TOKEN)).andReturn().getResponse()
                    .getStatus();
            assertThat(code).as(path).isIn(401, 403, 404);
        }
    }

    @Test
    void theApiIsUnchanged() throws Exception {
        mvc.perform(get("/api/products")).andExpect(status().isOk());
        mvc.perform(get("/api/admin/stats")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/stats").header("Authorization", "Bearer " + TOKEN))
                .andExpect(status().isUnauthorized());
    }
}
