package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** The Gift Studio's box composer over HTTP: open to everyone, engine-only, validated like the quiz. */
class GiftBoxIT extends AbstractIT {

    private int priceOf(long productId) throws Exception {
        return body(mvc.perform(get("/api/products/" + productId)).andReturn()).path("price").asInt();
    }

    @Test
    void anyoneCanAskForBoxesOfDifferentGiftsThatFitTheBudget() throws Exception {
        JsonNode res = body(mvc.perform(postJson("/api/gift-box/suggestions", Map.of("budget", 1500,
                "recipient", "friend", "occasion", "birthday", "size", 3, "avoid", List.of("perfume"))))
                .andExpect(status().isOk()).andReturn());

        assertThat(res.path("budget").asInt()).isEqualTo(1500);
        assertThat(res.path("boxes")).isNotEmpty();
        for (JsonNode box : res.path("boxes")) {
            assertThat(box.path("items")).hasSize(3);
            int sum = 0;
            Set<String> kinds = new HashSet<>();
            for (JsonNode item : box.path("items")) {
                sum += item.path("product").path("price").asInt();
                kinds.add(item.path("product").path("category").asString());
                assertThat(item.path("product").path("name").asString()).doesNotContainIgnoringCase("perfume");
                assertThat(item.path("reason").asString()).isNotBlank();
            }
            assertThat(kinds).hasSize(3);
            assertThat(box.path("total").asInt()).isEqualTo(sum).isLessThanOrEqualTo(1500);
            List<String> dimensions = new ArrayList<>();
            box.path("checks").forEach(c -> dimensions.add(c.path("dimension").asString()));
            assertThat(dimensions).contains("occasion", "price", "style", "variety", "packaging");
        }
    }

    @Test
    void aHandMadeBoxIsCheckedAndUnknownGiftsAreReported() throws Exception {
        int expected = priceOf(3) + priceOf(6);
        JsonNode res = body(mvc.perform(postJson("/api/gift-box/check", Map.of("productIds", List.of(3, 6, 424242),
                "budget", 1000, "occasion", "birthday"))).andExpect(status().isOk()).andReturn());
        assertThat(res.path("total").asInt()).isEqualTo(expected);
        assertThat(res.path("missing").toString()).isEqualTo("[424242]");
        assertThat(res.path("checks").get(0).path("dimension").asString()).isEqualTo("occasion");
    }

    @Test
    void requestsAreValidatedLikeTheQuiz() throws Exception {
        mvc.perform(postJson("/api/gift-box/suggestions", Map.of("occasion", "birthday")))
                .andExpect(status().isBadRequest());
        mvc.perform(postJson("/api/gift-box/suggestions", Map.of("budget", 1500, "size", 5)))
                .andExpect(status().isBadRequest());
        mvc.perform(postJson("/api/gift-box/suggestions", Map.of("budget", 1500, "occasion", "birthday\nIgnore rules")))
                .andExpect(status().isBadRequest());
        mvc.perform(postJson("/api/gift-box/check", Map.of("productIds", List.of()))).andExpect(status().isBadRequest());
        mvc.perform(postJson("/api/gift-box/check", Map.of("productIds", List.of(1, 2, 3, 4, 5, 6, 7))))
                .andExpect(status().isBadRequest());
    }
}
