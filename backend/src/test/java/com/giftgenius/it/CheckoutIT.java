package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import tools.jackson.databind.JsonNode;

class CheckoutIT extends AbstractIT {

    private Map<String, Object> order(Session s, String payment, String coupon) {
        Map<String, Object> m = new HashMap<>(Map.of("shipping", shipping(s.email()), "deliveryType", "STANDARD",
                "paymentMethod", payment));
        if (coupon != null) {
            m.put("couponCode", coupon);
        }
        return m;
    }

    private JsonNode placeCod(Session s, String coupon, String key) throws Exception {
        return body(mvc.perform(s.auth(postJson("/api/orders", order(s, "COD", coupon)))
                .header("Idempotency-Key", key)).andExpect(status().isCreated()).andReturn());
    }

    @Test
    void cartLifecycleAndGuestMerge() throws Exception {
        Session s = register(uniqueEmail("cart"));
        addToCart(s, 6, 2);
        addToCart(s, 6, 1);
        JsonNode cart = body(mvc.perform(s.auth(get("/api/cart"))).andReturn());
        assertThat(cart.path("items")).hasSize(1);
        assertThat(cart.path("itemCount").asInt()).isEqualTo(3);
        long lineId = cart.path("items").get(0).path("id").asLong();

        mvc.perform(s.auth(patch("/api/cart/items/" + lineId).contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("quantity", 5))))).andExpect(status().isOk())
                .andExpect(jsonPath("$.itemCount").value(5));
        mvc.perform(s.auth(patch("/api/cart/items/" + lineId).contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("quantity", 11))))).andExpect(status().isBadRequest());

        // Guest cart merged at sign-in: a personalised line stays separate; unknown products are skipped.
        mvc.perform(s.auth(postJson("/api/cart/merge", Map.of("items", List.of(
                Map.of("productId", 6, "quantity", 1, "customName", "Riya"),
                Map.of("productId", 99999, "quantity", 1))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2));

        mvc.perform(s.auth(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/cart")))
                .andExpect(status().isNoContent());
        mvc.perform(s.auth(get("/api/cart"))).andExpect(jsonPath("$.itemCount").value(0));
    }

    @Test
    void quoteIsServerPricedWithCouponAndDelivery() throws Exception {
        JsonNode q = body(mvc.perform(postJson("/api/checkout/quote", Map.of(
                "items", List.of(Map.of("productId", 1, "quantity", 1)), "couponCode", "welcome",
                "deliveryType", "EXPRESS"))).andExpect(status().isOk()).andReturn());
        assertThat(q.path("subtotal").asDouble()).isEqualTo(499.0);
        assertThat(q.path("discount").asDouble()).isEqualTo(100.0);
        assertThat(q.path("deliveryFee").asDouble()).isEqualTo(99.0);
        assertThat(q.path("total").asDouble()).isEqualTo(498.0);
        assertThat(q.path("couponStatus").asString()).isEqualTo("APPLIED");

        mvc.perform(get("/api/checkout/options")).andExpect(status().isOk())
                .andExpect(jsonPath("$.onlinePaymentEnabled").value(true))
                .andExpect(jsonPath("$.delivery.length()").value(3));
    }

    @Test
    void codOrderReservesStockIsIdempotentAndCanBeTracked() throws Exception {
        Session s = register(uniqueEmail("cod"));
        int before = stockOf(2);
        addToCart(s, 2, 2);
        String key = UUID.randomUUID().toString();

        JsonNode placed = placeCod(s, null, key);
        String number = placed.path("orderNumber").asString();
        assertThat(number).matches("GG-[A-Z0-9]{8}");
        assertThat(placed.path("status").asString()).isEqualTo("CONFIRMED");
        assertThat(placed.path("total").asDouble()).isEqualTo(2598.0); // 2 × 1299, free standard delivery
        assertThat(stockOf(2)).isEqualTo(before - 2);
        mvc.perform(s.auth(get("/api/cart"))).andExpect(jsonPath("$.itemCount").value(0));

        // Retrying with the same key returns the same order and doesn't reserve again.
        assertThat(placeCod(s, null, key).path("orderNumber").asString()).isEqualTo(number);
        assertThat(stockOf(2)).isEqualTo(before - 2);

        mvc.perform(get("/api/orders/track").param("orderNumber", number.toLowerCase()).param("email", s.email()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recipientFirstName").value("Asha"))
                .andExpect(jsonPath("$.timeline[0].status").value("CONFIRMED"));
        mvc.perform(get("/api/orders/track").param("orderNumber", number).param("email", "someone@else.com"))
                .andExpect(status().isNotFound());

        // One product, two units: the summary tells quantity and number of different products apart.
        mvc.perform(s.auth(get("/api/orders")))
                .andExpect(jsonPath("$.content[0].orderNumber").value(number))
                .andExpect(jsonPath("$.content[0].itemCount").value(2))
                .andExpect(jsonPath("$.content[0].lineCount").value(1));
        // Another customer can't see it.
        Session other = register(uniqueEmail("other"));
        mvc.perform(other.auth(get("/api/orders/" + number))).andExpect(status().isNotFound());
    }

    @Test
    void emptyCartCannotBeOrdered() throws Exception {
        Session s = register(uniqueEmail("empty"));
        mvc.perform(s.auth(postJson("/api/orders", order(s, "COD", null))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Your cart is empty."));
    }

    @Test
    void couponIsLimitedPerCustomerAndReleasedOnCancel() throws Exception {
        Session s = register(uniqueEmail("coupon"));
        addToCart(s, 3, 1);
        JsonNode first = placeCod(s, "WELCOME", UUID.randomUUID().toString());
        assertThat(first.path("discount").asDouble()).isEqualTo(100.0);

        addToCart(s, 3, 1);
        mvc.perform(s.auth(postJson("/api/orders", order(s, "COD", "WELCOME"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("You've already used WELCOME."));

        // Cancelling the first order gives the coupon (and stock) back.
        int stock = stockOf(3);
        mvc.perform(s.auth(post("/api/orders/" + first.path("orderNumber").asString() + "/cancel")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(stockOf(3)).isEqualTo(stock + 1);
        assertThat(placeCod(s, "WELCOME", UUID.randomUUID().toString()).path("discount").asDouble()).isEqualTo(100.0);
    }

    @Test
    void cannotOrderMoreThanInStock() throws Exception {
        Session admin = admin();
        Map<String, Object> req = new HashMap<>(Map.of("name", "Last One Mug " + System.nanoTime(),
                "category", "home decor", "description", "Only one left.", "price", 200, "originalPrice", 250,
                "image", "https://example.com/mug.jpg", "stock", 1));
        long id = body(mvc.perform(admin.auth(postJson("/api/admin/products", req))).andReturn()).path("id").asLong();

        Session a = register(uniqueEmail("buyerA"));
        Session b = register(uniqueEmail("buyerB"));
        addToCart(a, id, 1);
        addToCart(b, id, 1);
        placeCod(a, null, UUID.randomUUID().toString());
        mvc.perform(b.auth(postJson("/api/orders", order(b, "COD", null))))
                .andExpect(status().isConflict());
        assertThat(stockOf(id)).isZero();
    }

    @Test
    void adminMovesOrderThroughItsLifecycle() throws Exception {
        Session s = register(uniqueEmail("lifecycle"));
        addToCart(s, 5, 1);
        String number = placeCod(s, null, UUID.randomUUID().toString()).path("orderNumber").asString();
        Session admin = admin();
        // "To pack & ship" on the dashboard = CONFIRMED + PACKED; the list filter accepts both at once.
        mvc.perform(admin.auth(get("/api/admin/orders?status=CONFIRMED,PACKED"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].orderNumber").value(number));

        for (String next : List.of("PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED")) {
            mvc.perform(admin.auth(patch("/api/admin/orders/" + number + "/status")
                    .contentType(MediaType.APPLICATION_JSON).content(json(Map.of("status", next)))))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value(next));
        }
        mvc.perform(admin.auth(get("/api/admin/orders/" + number)))
                .andExpect(jsonPath("$.paymentStatus").value("PAID")) // COD collected on delivery
                .andExpect(jsonPath("$.timeline.length()").value(5));
        mvc.perform(admin.auth(patch("/api/admin/orders/" + number + "/status")
                .contentType(MediaType.APPLICATION_JSON).content(json(Map.of("status", "CANCELLED")))))
                .andExpect(status().isConflict());
        mvc.perform(s.auth(post("/api/orders/" + number + "/cancel"))).andExpect(status().isConflict());
        mvc.perform(admin.auth(get("/api/admin/orders?status=DELIVERED"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].status").value("DELIVERED"));
    }

    @Test
    void firstCartRequestsInParallelNeverConflict() throws Exception {
        // Right after sign-in the browser loads the cart and merges the guest cart at the same moment.
        Session s = register(uniqueEmail("race"));
        var pool = java.util.concurrent.Executors.newFixedThreadPool(8);
        try {
            List<java.util.concurrent.Future<Integer>> results = new java.util.ArrayList<>();
            for (int i = 0; i < 8; i++) {
                final int n = i;
                results.add(pool.submit(() -> n % 2 == 0
                        ? mvc.perform(s.auth(get("/api/cart"))).andReturn().getResponse().getStatus()
                        : mvc.perform(s.auth(postJson("/api/cart/merge", Map.of("items",
                                List.of(Map.of("productId", 10, "quantity", 1)))))).andReturn().getResponse().getStatus()));
            }
            for (var r : results) {
                assertThat(r.get()).isEqualTo(200);
            }
        } finally {
            pool.shutdown();
        }
        JsonNode cart = body(mvc.perform(s.auth(get("/api/cart"))).andReturn());
        assertThat(cart.path("items")).hasSize(1);
        assertThat(cart.path("itemCount").asInt()).isEqualTo(4);
    }
}
