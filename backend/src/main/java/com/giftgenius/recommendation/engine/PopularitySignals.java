package com.giftgenius.recommendation.engine;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.giftgenius.order.model.OrderStatus;
import com.giftgenius.order.repository.OrderItemRepository;

/**
 * How well each product has sold lately, from orders that went ahead (not cancelled, not awaiting payment), as a share
 * of the best seller: 1.0 for the best seller, 0 for products that haven't sold. One read-only aggregate query,
 * refreshed at most every few minutes; no personal data is involved.
 */
@Component
public class PopularitySignals {

    private static final Logger log = LoggerFactory.getLogger(PopularitySignals.class);
    private static final Duration REFRESH = Duration.ofMinutes(10);
    private static final List<OrderStatus> NOT_SALES = List.of(OrderStatus.CANCELLED, OrderStatus.PENDING_PAYMENT);

    private final OrderItemRepository items;
    private final RecommendationWeights weights;
    private volatile Map<Long, Double> shares;
    private volatile Instant computedAt = Instant.EPOCH;

    public PopularitySignals(OrderItemRepository items, RecommendationWeights weights) {
        this.items = items;
        this.weights = weights;
    }

    /** 0..1 for this product. */
    public double of(Long productId) {
        return current().getOrDefault(productId, 0.0);
    }

    private Map<Long, Double> current() {
        Instant now = Instant.now();
        Map<Long, Double> s = shares;
        if (s == null || computedAt.plus(REFRESH).isBefore(now)) {
            s = refresh(now);
        }
        return s;
    }

    private synchronized Map<Long, Double> refresh(Instant now) {
        if (shares != null && !computedAt.plus(REFRESH).isBefore(now)) {
            return shares;
        }
        try {
            shares = load(now.minus(Duration.ofDays(weights.quality().popularityWindowDays())));
        } catch (RuntimeException e) {
            // Popularity is a bonus: without it, recommendations still work. Keep what we had and retry later.
            log.warn("Couldn't load sales for recommendations, using the last known figures: {}", e.getMessage());
            if (shares == null) {
                shares = Map.of();
            }
        }
        computedAt = now;
        return shares;
    }

    private Map<Long, Double> load(Instant since) {
        List<Object[]> rows = items.unitsSoldSince(since, NOT_SALES);
        long best = rows.stream().mapToLong(r -> ((Number) r[1]).longValue()).max().orElse(0);
        Map<Long, Double> next = new HashMap<>();
        if (best > 0) {
            rows.forEach(r -> next.put(((Number) r[0]).longValue(), ((Number) r[1]).doubleValue() / best));
        }
        return Map.copyOf(next);
    }
}
