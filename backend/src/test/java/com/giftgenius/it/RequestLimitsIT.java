package com.giftgenius.it;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.LongStream;

import org.junit.jupiter.api.Test;

/** Oversized input is refused with a 400 and a field error, before it reaches a service or the database. */
class RequestLimitsIT extends AbstractIT {

    private static final String LONG_EMAIL = "a".repeat(250) + "@example.com";

    @Test
    void aWishlistMergeOfMoreThanAHundredProductsIsRefused() throws Exception {
        Session s = register(uniqueEmail("limits-wish"));
        List<Long> ids = LongStream.rangeClosed(1, 101).boxed().toList();
        mvc.perform(s.auth(postJson("/api/wishlist/merge", Map.of("productIds", ids))))
                .andExpect(status().isBadRequest());
        mvc.perform(s.auth(postJson("/api/wishlist/merge", Map.of("productIds", List.of(1L, 2L)))))
                .andExpect(status().isOk());
    }

    @Test
    void anOverlongSignInEmailIsRefused() throws Exception {
        mvc.perform(postJson("/api/auth/login", Map.of("email", LONG_EMAIL, "password", "whatever-1")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.email").exists());
    }

    @Test
    void anOverlongDeliveryEmailIsRefusedAndNoOrderIsPlaced() throws Exception {
        Session s = register(uniqueEmail("limits-order"));
        addToCart(s, 1, 1);
        Map<String, Object> shipping = new HashMap<>(shipping(s.email()));
        shipping.put("email", LONG_EMAIL);
        mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping, "deliveryType", "STANDARD",
                "paymentMethod", "COD"))).header("Idempotency-Key", UUID.randomUUID().toString()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors['shipping.email']").exists());
    }

    @Test
    void anAdminProductWithTooManyOrOverlongTagsIsRefused() throws Exception {
        Session admin = admin();
        Map<String, Object> product = new HashMap<>(Map.of("name", "Limits Candle", "category", "home-decor",
                "description", "A candle for the limits test.", "price", 499, "originalPrice", 599,
                "image", "https://img.example/limits.jpg", "stock", 5));
        product.put("tags", List.of("candle"));
        mvc.perform(admin.auth(postJson("/api/admin/products", product))).andExpect(status().is2xxSuccessful()); // valid
        product.put("name", "Limits Candle Two");
        product.put("tags", List.of("x".repeat(41)));
        mvc.perform(admin.auth(postJson("/api/admin/products", product))).andExpect(status().isBadRequest());
        product.put("tags", LongStream.rangeClosed(1, 31).mapToObj(i -> "tag" + i).toList());
        mvc.perform(admin.auth(postJson("/api/admin/products", product))).andExpect(status().isBadRequest());
        product.put("longDescription", "x".repeat(10_001));
        product.put("tags", List.of("candle"));
        mvc.perform(admin.auth(postJson("/api/admin/products", product))).andExpect(status().isBadRequest());
    }
}
