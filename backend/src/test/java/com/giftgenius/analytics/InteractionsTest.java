package com.giftgenius.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

class InteractionsTest {

    @Test
    void anEventCarriesNoPersonalFields() {
        assertThat(Arrays.stream(InteractionEvent.class.getRecordComponents()).map(c -> c.getName()))
                .containsExactly("type", "productIds", "detail", "at");
    }

    @Test
    void theDetailIsShortAndOptional() {
        assertThat(InteractionEvent.search("  birthday mug  ", List.of(1L)).detail()).isEqualTo("birthday mug");
        assertThat(InteractionEvent.search("x".repeat(300), List.of()).detail()).hasSize(100);
        assertThat(InteractionEvent.search("   ", List.of()).detail()).isNull();
        assertThat(InteractionEvent.cartAdd(4).detail()).isNull();
    }

    @Test
    void wireNames() {
        assertThat(Arrays.stream(InteractionType.values()).map(InteractionType::wireName)).containsExactly(
                "product_view", "product_click", "recommendation_view", "recommendation_click", "wishlist_add",
                "cart_add", "purchase", "search");
    }

    @Test
    void theListenerPassesEventsOnAndARecorderFailureNeverEscapes() {
        List<InteractionEvent> recorded = new ArrayList<>();
        new InteractionListener(recorded::add).on(InteractionEvent.productView(4));
        assertThat(recorded).extracting(InteractionEvent::type).containsExactly(InteractionType.PRODUCT_VIEW);

        InteractionListener failing = new InteractionListener(e -> {
            throw new IllegalStateException("analytics down");
        });
        assertThatCode(() -> failing.on(InteractionEvent.cartAdd(4))).doesNotThrowAnyException();
    }
}
