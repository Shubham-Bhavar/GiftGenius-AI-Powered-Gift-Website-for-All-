package com.giftgenius.recommendation.engine;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

/**
 * Every number the engine scores with, in one place. Override any of them under {@code app.recommendation}
 * (e.g. APP_RECOMMENDATION_OCCASION=35); the defaults below are the tuned values.
 *
 * @param occasion            made for the occasion
 * @param withinBudget        priced at or under the budget
 * @param comfortablyInBudget priced at or under {@code comfortableShare} of the budget (on top of withinBudget)
 * @param overBudget          over the budget but within {@code budgetTolerance} (a penalty)
 * @param recipient           a gift for this relationship
 * @param interest            the product's category is one of their interests
 * @param personality         suits their personality
 * @param ratingPerPoint      points per rating point above 4.0 …
 * @param maxRatingBonus      … up to this many
 * @param budgetTolerance     never suggest anything priced above budget × this
 * @param comfortableShare    share of the budget that counts as "comfortably within"
 */
@ConfigurationProperties(prefix = "app.recommendation")
public record RecommendationWeights(
        @DefaultValue("30") double occasion,
        @DefaultValue("25") double withinBudget,
        @DefaultValue("10") double comfortablyInBudget,
        @DefaultValue("-20") double overBudget,
        @DefaultValue("20") double recipient,
        @DefaultValue("15") double interest,
        @DefaultValue("10") double personality,
        @DefaultValue("10") double ratingPerPoint,
        @DefaultValue("10") double maxRatingBonus,
        @DefaultValue("1.15") double budgetTolerance,
        @DefaultValue("0.8") double comfortableShare) {

    /** The defaults, as Spring would bind them with nothing configured (for tests and tools). */
    public static RecommendationWeights defaults() {
        return new Binder(new MapConfigurationPropertySource()).bindOrCreate("app.recommendation", RecommendationWeights.class);
    }
}
