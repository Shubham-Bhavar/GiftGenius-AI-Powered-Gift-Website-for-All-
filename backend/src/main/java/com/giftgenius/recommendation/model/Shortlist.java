package com.giftgenius.recommendation.model;

import java.util.List;

/** The engine's answer: recommendations, best first, and how they were found. */
public record Shortlist(List<Recommendation> items, Outcome outcome) {

    public enum Outcome {
        /** Products matched the preferences. */
        MATCHED,
        /** Nothing matched, so these are the best-rated products within the budget. */
        TOP_RATED,
        /** Nothing in the shop is within the budget. */
        NOTHING_IN_BUDGET,
        /** Nothing can be bought right now. */
        CATALOG_EMPTY
    }

    public Shortlist {
        items = List.copyOf(items);
    }
}
