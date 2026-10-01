package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

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

    /** The browser's verify call, signed exactly as Razorpay Checkout signs a successful payment. */
    private MockHttpServletRequestBuilder verify(Session s, String number, String rzpOrder, String paymentId) {
        return s.auth(postJson("/api/orders/" + number + "/payment/verify", Map.of("razorpayOrderId", rzpOrder,
                "razorpayPaymentId", paymentId, "razorpaySignature", hmac(rzpOrder + "|" + paymentId, RZP_KEY_SECRET))));
    }

    /** A correctly signed Razorpay webhook for one payment; returns the HTTP status. */
    private int webhook(String event, String rzpOrder, String paymentId, long amountPaise, String currency)
            throws Exception {
        String payload = json(Map.of("event", event, "payload", Map.of("payment", Map.of("entity", Map.of(
                "id", paymentId, "order_id", rzpOrder, "amount", amountPaise, "currency", currency)))));
        return mvc.perform(post("/api/payments/razorpay/webhook").contentType(MediaType.APPLICATION_JSON)
                .content(payload).header("X-Razorpay-Signature", hmac(payload, RZP_WEBHOOK_SECRET)))
                .andReturn().getResponse().getStatus();
    }

    private JsonNode order(Session s, String number) throws Exception {
        return body(mvc.perform(s.auth(get("/api/orders/" + number))).andReturn());
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
        long amount = order.path("payment").path("amountPaise").asLong();
        String payload = json(Map.of("event", "payment.captured", "payload", Map.of("payment",
                Map.of("entity", Map.of("id", "pay_hook", "order_id", rzpOrder, "amount", amount, "currency", "INR")))));

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
    void verifyIsBoundToTheShoppersOwnOrderAndIsIdempotent() throws Exception {
        Session s = register(uniqueEmail("own"));
        addToCart(s, 4, 1);
        JsonNode placed = placeOnline(s);
        String number = placed.path("orderNumber").asString();
        String rzpOrder = placed.path("payment").path("razorpayOrderId").asString();

        // Someone else can't confirm (or even see) this order, even with a genuine signature.
        Session other = register(uniqueEmail("other"));
        mvc.perform(verify(other, number, rzpOrder, "pay_own")).andExpect(status().isNotFound());
        mvc.perform(verify(s, "GG-NOSUCH01", rzpOrder, "pay_own")).andExpect(status().isNotFound());
        // A genuine signature for a different Razorpay order doesn't pay for this one.
        mvc.perform(verify(s, number, "order_someone_else", "pay_own")).andExpect(status().isBadRequest());
        assertThat(order(s, number).path("paymentStatus").asString()).isEqualTo("PENDING");

        mvc.perform(verify(s, number, rzpOrder, "pay_own")).andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentStatus").value("PAID"));
        // Refresh / double click / second tab, then the webhook for the same payment: all harmless.
        mvc.perform(verify(s, number, rzpOrder, "pay_own")).andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentStatus").value("PAID"));
        assertThat(webhook("payment.captured", rzpOrder, "pay_own", placed.path("payment").path("amountPaise").asLong(),
                "INR")).isEqualTo(200);
        JsonNode paid = order(s, number);
        assertThat(paid.path("status").asString()).isEqualTo("CONFIRMED");
        assertThat(paid.path("timeline")).hasSize(2);
    }

    @Test
    void failedAttemptsAndWrongAmountsNeverConfirmAnOrder() throws Exception {
        Session s = register(uniqueEmail("retry"));
        addToCart(s, 6, 1);
        JsonNode placed = placeOnline(s);
        String number = placed.path("orderNumber").asString();
        String rzpOrder = placed.path("payment").path("razorpayOrderId").asString();
        long amount = placed.path("payment").path("amountPaise").asLong();

        // A UPI request that timed out: the order stays payable, with its payment details, for a retry.
        assertThat(webhook("payment.failed", rzpOrder, "pay_fail", amount, "INR")).isEqualTo(200);
        mvc.perform(s.auth(get("/api/orders/" + number)))
                .andExpect(jsonPath("$.status").value("PENDING_PAYMENT"))
                .andExpect(jsonPath("$.paymentStatus").value("FAILED"))
                .andExpect(jsonPath("$.payment.razorpayOrderId").value(rzpOrder));

        // A signed event for the wrong amount or currency is acknowledged but never trusted.
        assertThat(webhook("payment.captured", rzpOrder, "pay_short", amount - 100, "INR")).isEqualTo(200);
        assertThat(webhook("order.paid", rzpOrder, "pay_usd", amount, "USD")).isEqualTo(200);
        assertThat(order(s, number).path("status").asString()).isEqualTo("PENDING_PAYMENT");

        // The retry succeeds.
        mvc.perform(verify(s, number, rzpOrder, "pay_retry")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.paymentStatus").value("PAID"));
    }

    @Test
    void paymentThatLandsAfterCancellationIsFlaggedForRefund() throws Exception {
        Session s = register(uniqueEmail("late"));
        addToCart(s, 3, 1);
        JsonNode placed = placeOnline(s);
        String number = placed.path("orderNumber").asString();
        String rzpOrder = placed.path("payment").path("razorpayOrderId").asString();
        mvc.perform(s.auth(post("/api/orders/" + number + "/cancel"))).andExpect(status().isOk());

        // The payment window was still open in another tab and the shopper paid anyway.
        mvc.perform(verify(s, number, rzpOrder, "pay_late")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.paymentStatus").value("REFUND_PENDING"))
                .andExpect(jsonPath("$.payment").doesNotExist());
        assertThat(webhook("payment.captured", rzpOrder, "pay_late", placed.path("payment").path("amountPaise").asLong(),
                "INR")).isEqualTo(200);
        assertThat(order(s, number).path("paymentStatus").asString()).isEqualTo("REFUND_PENDING");

        // A cash-on-delivery order has nothing to verify.
        addToCart(s, 6, 1);
        String cod = body(mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()),
                "deliveryType", "STANDARD", "paymentMethod", "COD")))).andReturn()).path("orderNumber").asString();
        mvc.perform(verify(s, cod, rzpOrder, "pay_cod")).andExpect(status().isConflict());
    }

    @Test
    void browserAndWebhookConfirmingAtOnceConfirmTheOrderOnce() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 3; round++) {
                Session s = register(uniqueEmail("race"));
                addToCart(s, 1, 1);
                JsonNode placed = placeOnline(s);
                String number = placed.path("orderNumber").asString();
                String rzpOrder = placed.path("payment").path("razorpayOrderId").asString();
                long amount = placed.path("payment").path("amountPaise").asLong();

                CountDownLatch start = new CountDownLatch(1);
                List<Callable<Integer>> both = List.of(
                        () -> {
                            start.await();
                            return mvc.perform(verify(s, number, rzpOrder, "pay_race")).andReturn().getResponse()
                                    .getStatus();
                        },
                        () -> {
                            start.await();
                            return webhook("payment.captured", rzpOrder, "pay_race", amount, "INR");
                        });
                List<Future<Integer>> results = new ArrayList<>();
                for (Callable<Integer> c : both) {
                    results.add(pool.submit(c));
                }
                start.countDown();
                for (Future<Integer> f : results) {
                    assertThat(f.get(30, TimeUnit.SECONDS)).isEqualTo(200);
                }
                JsonNode paid = order(s, number);
                assertThat(paid.path("paymentStatus").asString()).isEqualTo("PAID");
                assertThat(paid.path("timeline")).as("confirmed exactly once").hasSize(2);
            }
        } finally {
            pool.shutdownNow();
        }
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
