package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import tools.jackson.databind.JsonNode;

class ContactIT extends AbstractIT {

    @Test
    void messageIsStoredAndTheStoreIsNotifiedButNeverTheSender() throws Exception {
        String sender = uniqueEmail("visitor");
        mvc.perform(postJson("/api/contact", Map.of("name", "Riya Shah", "email", sender, "topic", "bulk",
                "orderNumber", "gg-abcd2345", "message", "We need 40 hampers for a Diwali team event.")))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("received"));

        verify(mailer).send(eq(ADMIN_EMAIL), anyString(), anyString());
        verify(mailer, never()).send(eq(sender), anyString(), anyString());

        Session admin = admin();
        JsonNode inbox = body(mvc.perform(admin.auth(get("/api/admin/messages?handled=false"))).andExpect(status().isOk()).andReturn());
        JsonNode msg = null;
        for (JsonNode m : inbox.path("content")) {
            if (m.path("email").asString().equals(sender)) {
                msg = m;
            }
        }
        assertThat(msg).isNotNull();
        assertThat(msg.path("orderNumber").asString()).isEqualTo("GG-ABCD2345");
        assertThat(msg.path("topic").asString()).isEqualTo("bulk");

        mvc.perform(admin.auth(patch("/api/admin/messages/" + msg.path("id").asLong())
                .contentType(MediaType.APPLICATION_JSON).content(json(Map.of("handled", true)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handled").value(true))
                .andExpect(jsonPath("$.handledAt").exists());
    }

    @Test
    void invalidMessagesAreRejectedPerField() throws Exception {
        mvc.perform(postJson("/api/contact", Map.of("name", "", "email", "nope", "topic", "spam", "message", "hi")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.email").value("Enter a valid email"))
                .andExpect(jsonPath("$.errors.topic").value("Choose a topic"))
                .andExpect(jsonPath("$.errors.message").value("Use 10 to 2000 characters"));
    }

    @Test
    void inboxIsForAdminsOnly() throws Exception {
        Session s = register(uniqueEmail("snoop"));
        mvc.perform(s.auth(get("/api/admin/messages"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/messages")).andExpect(status().isUnauthorized());
    }

    @Test
    void babyAndAchievementOccasionsHaveGifts() throws Exception {
        JsonNode baby = body(mvc.perform(get("/api/products?occasion=baby")).andReturn());
        assertThat(baby.path("totalElements").asInt()).isGreaterThanOrEqualTo(4);
        JsonNode achievement = body(mvc.perform(get("/api/products?occasion=achievement")).andReturn());
        assertThat(achievement.path("content").toString()).contains("Graduation Memory Box");
    }
}
