package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

/**
 * GG-53: what the order page may say about the confirmation email comes from the outbox. Here no email provider is
 * configured (as in local development and in a shop that hasn't set SMTP up), so it says NOT_SENT, never sent or on
 * its way. Delivery that the mail server accepted (SENT) is checked in {@link EmailDeliveryAppIT}.
 */
class OrderConfirmationEmailIT extends AbstractIT {

    @Test
    void withoutAnEmailProviderTheOrderSaysTheConfirmationWasNotSent() throws Exception {
        Session s = register(uniqueEmail("no-smtp"));
        addToCart(s, 1, 1);
        String number = body(mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()),
                "deliveryType", "STANDARD", "paymentMethod", "COD")))
                .header("Idempotency-Key", UUID.randomUUID().toString())).andExpect(status().isCreated()).andReturn())
                .path("orderNumber").asString();

        assertThat(queuedEmails(number, "ORDER_CONFIRMED")).as("the email is still queued, for when SMTP is set up")
                .hasSize(1);
        mvc.perform(s.auth(get("/api/orders/" + number))).andExpect(status().isOk())
                .andExpect(jsonPath("$.confirmationEmail").value("NOT_SENT"));
    }

    @Test
    void onlyTheCustomersOwnOrderDetailSaysAnythingAboutTheEmail() throws Exception {
        Session s = register(uniqueEmail("email-status-scope"));
        addToCart(s, 1, 1);
        String number = body(mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()),
                "deliveryType", "STANDARD", "paymentMethod", "COD")))
                .header("Idempotency-Key", UUID.randomUUID().toString())).andExpect(status().isCreated()).andReturn())
                .path("orderNumber").asString();

        mvc.perform(s.auth(get("/api/orders"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].confirmationEmail").doesNotExist());
        mvc.perform(admin().auth(get("/api/admin/orders/" + number))).andExpect(status().isOk())
                .andExpect(jsonPath("$.confirmationEmail").doesNotExist());
        Session other = register(uniqueEmail("email-status-other"));
        mvc.perform(other.auth(get("/api/orders/" + number))).andExpect(status().isNotFound());
    }
}
