package com.giftgenius.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.ReflectionTestUtils;

import com.giftgenius.it.AbstractIT;
import com.giftgenius.notify.EmailKind;
import com.giftgenius.notify.EmailOutbox;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * An order is never failed by its emails: with every email failing as it's built, orders are still placed, confirmed
 * and cancelled through the real API, in their real transactions.
 */
class OrderEmailIsolationIT extends AbstractIT {

    @Autowired
    private OrderNotifier notifier;

    private Object realOutbox;
    private final SimpleMeterRegistry failures = new SimpleMeterRegistry();

    /** Fails every email, as a bug in an email's template would. */
    private final EmailOutbox broken = new EmailOutbox(null, e -> { }, failures) {
        @Override
        public boolean enqueue(String dedupeKey, EmailKind kind, Long orderId, String to, String subject, String body,
                String html) {
            throw new IllegalStateException("simulated template bug");
        }
    };

    @BeforeEach
    void breakEveryEmail() {
        realOutbox = ReflectionTestUtils.getField(notifier, "outbox");
        ReflectionTestUtils.setField(notifier, "outbox", broken);
    }

    @AfterEach
    void restore() {
        ReflectionTestUtils.setField(notifier, "outbox", realOutbox);
    }

    @Test
    void anOrderIsPlacedConfirmedAndCancelledEvenWhenItsEmailsCantBeBuilt() throws Exception {
        Session s = register(uniqueEmail("isolation"));
        addToCart(s, 1, 1);
        String number = body(mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()),
                "deliveryType", "STANDARD", "paymentMethod", "COD")))
                .header("Idempotency-Key", UUID.randomUUID().toString())).andExpect(status().isCreated()).andReturn())
                .path("orderNumber").asString();

        mvc.perform(s.auth(get("/api/orders/" + number))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"));
        mvc.perform(s.auth(post("/api/orders/" + number + "/cancel"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));

        assertThat(queuedEmails(number)).as("nothing queued").isEmpty();
        assertThat(failures.find("giftgenius.email.queue.failures").tag("reason", "content").counter().count())
                .as("each failed email counted: the confirmation, the owner's copy and the cancellation").isEqualTo(3);
    }
}
