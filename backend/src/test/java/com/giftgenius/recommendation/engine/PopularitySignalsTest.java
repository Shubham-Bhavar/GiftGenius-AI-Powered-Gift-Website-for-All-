package com.giftgenius.recommendation.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.giftgenius.order.model.OrderStatus;
import com.giftgenius.order.repository.OrderItemRepository;

class PopularitySignalsTest {

    private final OrderItemRepository items = mock(OrderItemRepository.class);
    private final PopularitySignals popularity = new PopularitySignals(items, RecommendationWeights.defaults());

    @Test
    void salesAreAShareOfTheBestSeller() {
        when(items.unitsSoldSince(any(), anyCollection()))
                .thenReturn(List.of(new Object[] { 6L, 40L }, new Object[] { 1L, 10L }));
        assertThat(popularity.of(6L)).isEqualTo(1.0);
        assertThat(popularity.of(1L)).isCloseTo(0.25, within(1e-9));
        assertThat(popularity.of(99L)).isZero();
    }

    @Test
    void noSalesMeansNoPopularity() {
        assertThat(popularity.of(1L)).isZero();
    }

    @Test
    void aFailingQueryMeansNoPopularityRatherThanNoRecommendations() {
        when(items.unitsSoldSince(any(), anyCollection())).thenThrow(new IllegalStateException("database down"));
        assertThat(popularity.of(1L)).isZero();
        assertThat(popularity.of(2L)).isZero();
        verify(items, times(1)).unitsSoldSince(any(), anyCollection()); // and it waits before retrying
    }

    @SuppressWarnings("unchecked")
    @Test
    void countsRecentOrdersThatWentAheadAndQueriesOnlyOccasionally() {
        Instant before = Instant.now();
        popularity.of(1L);
        popularity.of(2L);
        popularity.of(3L);

        ArgumentCaptor<Instant> since = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<Collection<OrderStatus>> excluded = ArgumentCaptor.forClass(Collection.class);
        verify(items, times(1)).unitsSoldSince(since.capture(), excluded.capture());
        assertThat(excluded.getValue()).containsExactlyInAnyOrder(OrderStatus.CANCELLED, OrderStatus.PENDING_PAYMENT);
        assertThat(Duration.between(since.getValue(), before)).isBetween(Duration.ofDays(90).minusMinutes(1),
                Duration.ofDays(90).plusMinutes(1));
    }
}
