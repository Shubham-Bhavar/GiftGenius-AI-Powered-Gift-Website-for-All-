package com.giftgenius.recommendation.model;

import java.util.List;

/**
 * The budget planner's answer: one gift of each kind within the budget, so the shopper compares three different
 * ideas instead of scrolling through many similar ones.
 *
 * @param options one recommendation per kind that has something within the budget, in the planner's order
 * @param missing the kinds with nothing within the budget
 */
public record GiftPlan(int budget, List<Option> options, List<String> missing) {

    /** @param kind "practical", "emotional" or "experience" */
    public record Option(String kind, Recommendation pick) {
    }

    public GiftPlan {
        options = List.copyOf(options);
        missing = List.copyOf(missing);
    }
}
