package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import tools.jackson.databind.JsonNode;

/**
 * An order paid in full by a coupon (₹0: reachable when standard delivery is free, as configured here) and then
 * cancelled owes the customer nothing: it isn't put in the refunds queue, and its email doesn't promise a refund.
 */
@DirtiesContext
class FreeOrderCancelIT extends AbstractIT {

    @DynamicPropertySource
    static void freeDelivery(DynamicPropertyRegistry r) {
        r.add("app.shipping.standard-fee", () -> "0");
    }

    @Test
    void cancellingAnOrderPaidInFullByACouponOwesNoRefund() throws Exception {
        String code = "FREE" + Long.toString(System.nanoTime(), 36).toUpperCase();
        mvc.perform(admin().auth(postJson("/api/admin/coupons", Map.of("code", code, "type", "PERCENT",
                "discountValue", 100, "active", true)))).andExpect(status().is2xxSuccessful());
        Session s = register(uniqueEmail("free-order"));
        addToCart(s, 6, 1);
        JsonNode placed = body(mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()),
                "deliveryType", "STANDARD", "paymentMethod", "COD", "couponCode", code)))
                .header("Idempotency-Key", UUID.randomUUID().toString())).andExpect(status().isCreated()).andReturn());
        String number = placed.path("orderNumber").asString();
        assertThat(placed.path("total").asDouble()).as("paid in full by the coupon").isZero();
        assertThat(placed.path("paymentStatus").asString()).isEqualTo("PAID");

        mvc.perform(s.auth(post("/api/orders/" + number + "/cancel"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.paymentStatus").value("PAID"));
        assertThat(queuedEmails(number, "ORDER_STATUS")).singleElement()
                .satisfies(e -> assertThat(e.body()).contains("Your order is cancelled as you asked.")
                        .doesNotContain("refund"));
    }
}
