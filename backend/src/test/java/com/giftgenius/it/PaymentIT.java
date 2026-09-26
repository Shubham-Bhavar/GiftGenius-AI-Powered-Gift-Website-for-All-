package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import com.giftgenius.payment.RazorpaySignatures;

import tools.jackson.databind.JsonNode;

class PaymentIT extends AbstractIT {

    @AfterEach
    void razorpayUp() {
        RAZORPAY_DOWN.set(false);
    }

    private JsonNode placeOnline(Session s) throws Exception {
        var r = mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()),
                "deliveryType", "EXPRESS", "paymentMethod", "ONLINE")))
                .header("Idempotency-Key", UUID.randomUUID().toString())).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(201);
        return body(r);
    }

    private static String hmac(String data, String secret) {
        // Reuse production code's HMAC so the test signs exactly like Razorpay does.
        try {
            var m = RazorpaySignatures.class.getDeclaredMethod("hmacHex", String.class, String.class);
            m.setAccessible(true);
            return (String) m.invoke(null, data, secret);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void onlinePaymentIsVerifiedBySignatureAndClearsOnlyPaidItems() throws Exception {
        Session s = register(uniqueEmail("pay"));
        addToCart(s, 4, 1);
        JsonNode order = placeOnline(s);
        String number = order.path("orderNumber").asString();
        JsonNode pay = order.path("payment");
        assertThat(order.path("status").asString()).isEqualTo("PENDING_PAYMENT");
        assertThat(pay.path("keyId").asString()).isEqualTo("rzp_test_it");
        assertThat(pay.path("amountPaise").asLong()).isEqualTo((1199 + 99) * 100L);
        String rzpOrder = pay.path("razorpayOrderId").asString();

        // The cart is kept while payment is pending; the shopper adds something else meanwhile.
        addToCart(s, 6, 1);

        mvc.perform(s.auth(postJson("/api/orders/" + number + "/payment/verify", Map.of(
                "razorpayOrderId", rzpOrder, "razorpayPaymentId", "pay_1", "razorpaySignature", "bad"))))
                .andExpect(status().isBadRequest());

        mvc.perform(s.auth(postJson("/api/orders/" + number + "/payment/verify", Map.of(
                "razorpayOrderId", rzpOrder, "razorpayPaymentId", "pay_1",
                "razorpaySignature", hmac(rzpOrder + "|pay_1", RZP_KEY_SECRET)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.paymentStatus").value("PAID"))
                .andExpect(jsonPath("$.payment").doesNotExist());

        JsonNode cart = body(mvc.perform(s.auth(get("/api/cart"))).andReturn());
        assertThat(cart.path("items")).hasSize(1);
        assertThat(cart.path("items").get(0).path("productId").asLong()).isEqualTo(6L);
    }

    @Test
    void webhookConfirmsPaymentWhenTheBrowserNeverReturns() throws Exception {
        Session s = register(uniqueEmail("hook"));
        addToCart(s, 7, 1);
        JsonNode order = placeOnline(s);
        String rzpOrder = order.path("payment").path("razorpayOrderId").asString();
        String payload = json(Map.of("event", "payment.captured", "payload", Map.of("payment",
                Map.of("entity", Map.of("id", "pay_hook", "order_id", rzpOrder)))));

        mvc.perform(post("/api/payments/razorpay/webhook").contentType(MediaType.APPLICATION_JSON).content(payload)
                .header("X-Razorpay-Signature", "forged")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/payments/razorpay/webhook").contentType(MediaType.APPLICATION_JSON).content(payload)
                .header("X-Razorpay-Signature", hmac(payload, RZP_WEBHOOK_SECRET))).andExpect(status().isOk());
        // Duplicate delivery is harmless.
        mvc.perform(post("/api/payments/razorpay/webhook").contentType(MediaType.APPLICATION_JSON).content(payload)
                .header("X-Razorpay-Signature", hmac(payload, RZP_WEBHOOK_SECRET))).andExpect(status().isOk());

        mvc.perform(s.auth(get("/api/orders/" + order.path("orderNumber").asString())))
                .andExpect(jsonPath("$.paymentStatus").value("PAID"))
                .andExpect(jsonPath("$.timeline.length()").value(2));
    }

    @Test
    void razorpayOutageCancelsTheOrderAndReleasesStock() throws Exception {
        Session s = register(uniqueEmail("outage"));
        int before = stockOf(8);
        addToCart(s, 8, 2);
        RAZORPAY_DOWN.set(true);

        mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()),
                "deliveryType", "STANDARD", "paymentMethod", "ONLINE"))))
                .andExpect(status().isServiceUnavailable());

        assertThat(stockOf(8)).isEqualTo(before);
        mvc.perform(s.auth(get("/api/orders"))).andExpect(jsonPath("$.content[0].status").value("CANCELLED"));
        mvc.perform(s.auth(get("/api/cart"))).andExpect(jsonPath("$.itemCount").value(2));
    }

    @Test
    void unpaidOnlineOrdersAreCapped() throws Exception {
        Session s = register(uniqueEmail("hoard"));
        for (int i = 0; i < 3; i++) {
            addToCart(s, 9, 1);
            placeOnline(s);
        }
        mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()),
                "deliveryType", "STANDARD", "paymentMethod", "ONLINE"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("unpaid orders")));
    }
}
