package com.giftgenius.analytics;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

/**
 * Something a shopper did with products, as an anonymous fact: what happened, to which products, and when. It
 * deliberately carries no user id, email, name, address, IP or order number. Published as a Spring application
 * event; see {@link InteractionRecorder}.
 *
 * @param productIds the products involved (empty for a search with no results)
 * @param detail     a short, non-personal qualifier: the search text (trimmed, at most 100 characters) or where
 *                   recommendations came from ("ai" or "rules"); null when there is none
 */
public record InteractionEvent(InteractionType type, List<Long> productIds, String detail, Instant at) {

    private static final int MAX_DETAIL = 100;

    public InteractionEvent {
        productIds = List.copyOf(productIds);
        if (detail != null) {
            detail = detail.strip();
            detail = detail.isEmpty() ? null : detail.substring(0, Math.min(detail.length(), MAX_DETAIL));
        }
    }

    public static InteractionEvent productView(long productId) {
        return of(InteractionType.PRODUCT_VIEW, List.of(productId), null);
    }

    public static InteractionEvent cartAdd(long productId) {
        return of(InteractionType.CART_ADD, List.of(productId), null);
    }

    public static InteractionEvent wishlistAdd(long productId) {
        return of(InteractionType.WISHLIST_ADD, List.of(productId), null);
    }

    public static InteractionEvent purchase(Collection<Long> productIds) {
        return of(InteractionType.PURCHASE, List.copyOf(productIds), null);
    }

    public static InteractionEvent recommendationView(Collection<Long> productIds, String source) {
        return of(InteractionType.RECOMMENDATION_VIEW, List.copyOf(productIds), source);
    }

    public static InteractionEvent search(String query, Collection<Long> resultIds) {
        return of(InteractionType.SEARCH, List.copyOf(resultIds), query);
    }

    private static InteractionEvent of(InteractionType type, List<Long> productIds, String detail) {
        return new InteractionEvent(type, productIds, detail, Instant.now());
    }
}
