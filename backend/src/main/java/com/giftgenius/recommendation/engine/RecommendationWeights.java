package com.giftgenius.recommendation.engine;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

/**
 * Every number the engine scores with, in one place, tunable without code changes: any value can be overridden under
 * {@code app.recommendation} (e.g. {@code app.recommendation.fit.occasion=35}, or the environment variable
 * APP_RECOMMENDATION_FIT_OCCASION). The defaults below are the tuned values.
 */
@ConfigurationProperties(prefix = "app.recommendation")
public record RecommendationWeights(@DefaultValue Fit fit, @DefaultValue Budget budget, @DefaultValue Quality quality,
        @DefaultValue Variety variety) {

    /**
     * Points for matching what the shopper asked for.
     *
     * @param occasion    made for the occasion
     * @param recipient   a gift for this relationship
     * @param forWhom     made for her / him, when the recipient implies it
     * @param notForThem  made only for the other one (a for-her-only gift for a brother): a penalty
     * @param interest    their interest is the product's category or one of its tags
     * @param personality suits their personality
     * @param premium     a premium product, for someone who asked for luxury
     * @param festive     a festive or cultural product, for a festival
     */
    public record Fit(@DefaultValue("30") double occasion, @DefaultValue("20") double recipient,
            @DefaultValue("6") double forWhom, @DefaultValue("-25") double notForThem,
            @DefaultValue("15") double interest,
            @DefaultValue("10") double personality, @DefaultValue("8") double premium,
            @DefaultValue("12") double festive) {
    }

    /**
     * @param within           priced at or under the budget
     * @param comfortably      priced at or under {@code comfortableShare} of it (on top of {@code within})
     * @param over             over the budget but within {@code tolerance} (a penalty)
     * @param tolerance        nothing priced above budget × this is ever suggested
     * @param comfortableShare share of the budget that counts as "comfortably within"
     */
    public record Budget(@DefaultValue("25") double within, @DefaultValue("10") double comfortably,
            @DefaultValue("-20") double over, @DefaultValue("1.15") double tolerance,
            @DefaultValue("0.8") double comfortableShare) {
    }

    /**
     * How good the product is, independent of the shopper.
     *
     * @param ratingPerPoint       points per rating point above 4.0 …
     * @param maxRatingBonus       … up to this many
     * @param priorRating          cold start: ratings are averaged with this many {@code priorReviews} at this rating,
     *                             so a product with no reviews scores as solidly good rather than as zero
     * @param priorReviews         weight of that prior, in reviews
     * @param reviews              up to this many points for review volume …
     * @param reviewsForFull       … reached at this many reviews (log scale)
     * @param popularity           up to this many points for recent sales, relative to the best seller
     * @param popularityWindowDays how far back sales count
     * @param bestsellerShare      explanation: "a bestseller" from this share of the best seller's sales
     * @param wellReviewedMin      explanation: quote the rating from this many reviews
     */
    public record Quality(@DefaultValue("10") double ratingPerPoint, @DefaultValue("10") double maxRatingBonus,
            @DefaultValue("4.3") double priorRating, @DefaultValue("10") double priorReviews,
            @DefaultValue("4") double reviews, @DefaultValue("500") double reviewsForFull,
            @DefaultValue("8") double popularity, @DefaultValue("90") int popularityWindowDays,
            @DefaultValue("0.5") double bestsellerShare, @DefaultValue("20") int wellReviewedMin) {
    }

    /**
     * Keeps the final set varied: when choosing the next pick, each earlier pick in the same category or from the
     * same marketplace seller lowers a candidate's score by these many points.
     */
    public record Variety(@DefaultValue("12") double categoryRepeat, @DefaultValue("8") double sellerRepeat) {
    }

    /** The defaults, as Spring binds them with nothing configured (for tests and tools). */
    public static RecommendationWeights defaults() {
        return new Binder(new MapConfigurationPropertySource()).bindOrCreate("app.recommendation", RecommendationWeights.class);
    }
}
