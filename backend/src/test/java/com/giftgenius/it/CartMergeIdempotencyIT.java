package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import tools.jackson.databind.JsonNode;

/**
 * GG-45: the guest cart merged at sign-in is safe to retry. The same merge sent again under its Idempotency-Key (a
 * retry after a lost response, a refresh, a second tab) adds its lines once; a new guest cart, under a new key, still
 * merges; a merge without a key behaves as before.
 */
class CartMergeIdempotencyIT extends AbstractIT {

    private static final Map<String, Object> GUEST_CART = Map.of("items", List.of(
            Map.of("productId", 1, "quantity", 2),
            Map.of("productId", 3, "quantity", 1, "customName", "Meera")));

    private MvcResult merge(Session s, String key) throws Exception {
        var req = s.auth(postJson("/api/cart/merge", GUEST_CART));
        if (key != null) {
            req = req.header("Idempotency-Key", key);
        }
        return mvc.perform(req).andReturn();
    }

    /** product id → total quantity in the account's cart, read back from the API. */
    private Map<Long, Integer> cart(Session s) throws Exception {
        JsonNode items = body(mvc.perform(s.auth(get("/api/cart"))).andReturn()).path("items");
        Map<Long, Integer> out = new java.util.TreeMap<>();
        items.forEach(i -> out.merge(i.path("productId").asLong(), i.path("quantity").asInt(), Integer::sum));
        return out;
    }

    @Test
    void theSameMergeSentTwiceAddsItsLinesOnce() throws Exception {
        Session s = register(uniqueEmail("merge-retry"));
        String key = UUID.randomUUID().toString();
        MvcResult first = merge(s, key);
        MvcResult retry = merge(s, key);
        assertThat(first.getResponse().getStatus()).isEqualTo(200);
        assertThat(retry.getResponse().getStatus()).isEqualTo(200);
        assertThat(cart(s)).isEqualTo(Map.of(1L, 2, 3L, 1));
        assertThat(body(retry).path("items")).as("the retry answers the cart as it is").hasSize(2);
    }

    @Test
    void aNewGuestCartUnderANewKeyStillMerges() throws Exception {
        Session s = register(uniqueEmail("merge-new"));
        merge(s, UUID.randomUUID().toString());
        merge(s, UUID.randomUUID().toString()); // signed out, shopped as a guest again, signed in again
        assertThat(cart(s)).isEqualTo(Map.of(1L, 4, 3L, 2));
    }

    @Test
    void aMergeWithoutAKeyBehavesAsBefore() throws Exception {
        Session s = register(uniqueEmail("merge-legacy"));
        merge(s, null);
        merge(s, null);
        assertThat(cart(s)).isEqualTo(Map.of(1L, 4, 3L, 2));
    }

    @Test
    void twoTabsMergingTheSameGuestCartAtOnceAddItOnce() throws Exception {
        Session s = register(uniqueEmail("merge-tabs"));
        String key = UUID.randomUUID().toString();
        ExecutorService pool = Executors.newFixedThreadPool(4);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            results.add(pool.submit(() -> {
                start.await();
                return merge(s, key).getResponse().getStatus();
            }));
        }
        start.countDown();
        for (Future<Integer> r : results) {
            assertThat(r.get()).isEqualTo(200);
        }
        pool.shutdown();
        assertThat(cart(s)).isEqualTo(Map.of(1L, 2, 3L, 1));
    }

    @Test
    void anOverlongKeyIsRefused() throws Exception {
        Session s = register(uniqueEmail("merge-long"));
        assertThat(merge(s, "k".repeat(65)).getResponse().getStatus()).isEqualTo(400);
        assertThat(cart(s)).isEmpty();
    }
}
