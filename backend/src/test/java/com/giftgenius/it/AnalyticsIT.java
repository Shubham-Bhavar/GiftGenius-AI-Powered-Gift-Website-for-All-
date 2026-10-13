package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

import com.giftgenius.analytics.InteractionEvent;
import com.giftgenius.analytics.InteractionType;

/** The interaction events the shop publishes for analytics: what happened to which products, and nothing personal. */
@RecordApplicationEvents
class AnalyticsIT extends AbstractIT {

    @Autowired
    private ApplicationEvents events;

    private List<InteractionEvent> of(InteractionType type) {
        return events.stream(InteractionEvent.class).filter(e -> e.type() == type).toList();
    }

    @Test
    void shoppingPublishesAnonymousInteractionEvents() throws Exception {
        Session s = register(uniqueEmail("analytics"));

        mvc.perform(get("/api/products/4")).andExpect(status().isOk());
        assertThat(of(InteractionType.PRODUCT_VIEW)).extracting(InteractionEvent::productIds).containsExactly(List.of(4L));

        mvc.perform(s.auth(put("/api/wishlist/4"))).andExpect(status().isOk());
        mvc.perform(s.auth(put("/api/wishlist/4"))).andExpect(status().isOk()); // already there: not a new add
        assertThat(of(InteractionType.WISHLIST_ADD)).extracting(InteractionEvent::productIds).containsExactly(List.of(4L));

        addToCart(s, 6, 2);
        assertThat(of(InteractionType.CART_ADD)).extracting(InteractionEvent::productIds).containsExactly(List.of(6L));

        mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()), "deliveryType", "STANDARD",
                "paymentMethod", "COD"))).header("Idempotency-Key", UUID.randomUUID().toString()))
                .andExpect(status().isCreated());
        assertThat(of(InteractionType.PURCHASE)).extracting(InteractionEvent::productIds).containsExactly(List.of(6L));

        when(ai.isAvailable()).thenReturn(false);
        mvc.perform(postJson("/api/ai/recommendations", Map.of("occasion", "birthday", "limit", 2)))
                .andExpect(status().isOk());
        assertThat(of(InteractionType.RECOMMENDATION_VIEW)).singleElement().satisfies(e -> {
            assertThat(e.productIds()).hasSize(2);
            assertThat(e.detail()).isEqualTo("rules");
        });

        // Nothing that identifies the shopper travels with any event.
        assertThat(events.stream(InteractionEvent.class)).allSatisfy(e -> assertThat(e.toString())
                .doesNotContain(s.email()).doesNotContain("Asha").doesNotContain("411001"));
    }

    @Test
    void anOnlineOrderIsNotAPurchaseUntilItIsPaid() throws Exception {
        Session s = register(uniqueEmail("analytics-online"));
        addToCart(s, 6, 1);
        mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()), "deliveryType", "STANDARD",
                "paymentMethod", "ONLINE"))).header("Idempotency-Key", UUID.randomUUID().toString()))
                .andExpect(status().isCreated());
        assertThat(of(InteractionType.PURCHASE)).isEmpty();
    }
}
