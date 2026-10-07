package com.giftgenius.recommendation.model;

import java.util.List;

/**
 * What the shopper told us, in the catalogue's vocabulary (e.g. "parent", "birthday", "food & sweets").
 * Any field may be null (interests: empty) when it wasn't answered. No budget, or ≤ 0, means "flexible".
 */
public record GiftPreferences(String recipient, String occasion, Integer budget, List<String> interests,
        String personality) {

    public GiftPreferences {
        interests = interests == null ? List.of() : List.copyOf(interests);
    }

    public boolean hasBudget() {
        return budget != null && budget > 0;
    }
}
