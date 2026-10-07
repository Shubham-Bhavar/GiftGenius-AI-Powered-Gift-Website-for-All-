package com.giftgenius.recommendation.engine;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Component;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.recommendation.engine.RecommendationWeights.Budget;
import com.giftgenius.recommendation.engine.RecommendationWeights.Fit;
import com.giftgenius.recommendation.engine.RecommendationWeights.Quality;
import com.giftgenius.recommendation.model.GiftPreferences;
import com.giftgenius.recommendation.model.Match;
import com.giftgenius.recommendation.model.ScoredProduct;
import com.giftgenius.recommendation.model.Signal;

/**
 * Scores one candidate: each matching signal adds its configured points (see {@link RecommendationWeights}).
 * Deterministic: the same product, preferences and inputs always score the same.
 */
@Component
public class ProductScorer {

    private static final String FESTIVAL = "festival";
    private static final String PREMIUM_TAG = "premium";

    private final RecommendationWeights w;

    public ProductScorer(RecommendationWeights weights) {
        this.w = weights;
    }

    /**
     * @param popularity recent sales as a share of the best seller (0..1)
     * @param personal   extra points from personalisation (0 for none)
     */
    public ScoredProduct score(ProductDto p, GiftPreferences prefs, double popularity, double personal) {
        Fit fit = w.fit();
        Budget budget = w.budget();
        Quality quality = w.quality();
        List<Match> matches = new ArrayList<>();
        double price = p.price().doubleValue();

        if (prefs.occasion() != null && p.occasion().contains(prefs.occasion())) {
            matches.add(new Match(Signal.OCCASION, prefs.occasion(), fit.occasion()));
        }
        if (prefs.hasBudget()) {
            if (price <= prefs.budget()) {
                matches.add(new Match(Signal.WITHIN_BUDGET, null, budget.within()));
                if (price <= prefs.budget() * budget.comfortableShare()) {
                    matches.add(new Match(Signal.COMFORTABLY_IN_BUDGET, null, budget.comfortably()));
                }
            } else {
                matches.add(new Match(Signal.OVER_BUDGET, null, budget.over()));
            }
        }
        String relationship = prefs.recipientTerms().stream().filter(p.relationship()::contains).findFirst().orElse(null);
        if (relationship != null) {
            matches.add(new Match(Signal.RECIPIENT, relationship, fit.recipient()));
        }
        if (prefs.forWhom() != null && !p.forWhom().isEmpty()) {
            matches.add(p.forWhom().contains(prefs.forWhom())
                    ? new Match(Signal.FOR_WHOM, prefs.forWhom(), fit.forWhom())
                    : new Match(Signal.NOT_FOR_WHOM, prefs.forWhom(), fit.notForThem()));
        }
        String interest = prefs.interests().stream()
                .filter(i -> i.equals(p.category()) || p.tags().contains(i)).findFirst().orElse(null);
        if (interest != null) {
            matches.add(new Match(Signal.INTEREST, interest, fit.interest()));
        }
        if (prefs.premium() && p.tags().contains(PREMIUM_TAG)) {
            matches.add(new Match(Signal.PREMIUM, null, fit.premium()));
        }
        if (prefs.personality() != null && p.personality().contains(prefs.personality())) {
            matches.add(new Match(Signal.PERSONALITY, prefs.personality(), fit.personality()));
        }
        if (FESTIVAL.equals(prefs.occasion()) && (p.isFestival() || p.isCultural())) {
            matches.add(new Match(Signal.FESTIVE, null, fit.festive()));
        }
        if (popularity > 0) {
            matches.add(new Match(Signal.POPULARITY, null, quality.popularity() * Math.min(popularity, 1)));
        }
        double reviewShare = Math.min(Math.log10(p.reviewCount() + 1.0) / Math.log10(quality.reviewsForFull() + 1), 1);
        if (reviewShare > 0) {
            matches.add(new Match(Signal.REVIEWS, null, quality.reviews() * reviewShare));
        }
        double ratingBonus = Math.max(0, Math.min((adjustedRating(p) - 4.0) * quality.ratingPerPoint(),
                quality.maxRatingBonus()));
        if (ratingBonus > 0) {
            matches.add(new Match(Signal.RATING, null, ratingBonus));
        }
        if (p.reviewCount() == 0) {
            matches.add(new Match(Signal.NEW_ARRIVAL, null, 0));
        }
        if (personal != 0) {
            matches.add(new Match(Signal.PERSONAL, null, personal));
        }
        double score = 0;
        for (Match m : matches) {
            score += m.points();
        }
        return new ScoredProduct(p, score, matches);
    }

    /**
     * Cold start: the rating averaged with a neutral prior worth {@code priorReviews} reviews. A new product with no
     * reviews counts as solidly good (the prior); with many reviews, its own rating dominates.
     */
    double adjustedRating(ProductDto p) {
        Quality q = w.quality();
        int n = p.reviewCount();
        double own = p.rating() == null ? 0 : p.rating().doubleValue();
        return (q.priorRating() * q.priorReviews() + own * n) / (q.priorReviews() + n);
    }
}
