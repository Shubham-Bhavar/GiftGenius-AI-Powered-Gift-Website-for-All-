package com.giftgenius.recommendation.engine;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Component;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.recommendation.model.GiftPreferences;
import com.giftgenius.recommendation.model.Match;
import com.giftgenius.recommendation.model.ScoredProduct;
import com.giftgenius.recommendation.model.Signal;

/** Scores one candidate against the preferences: each matching signal adds its weight. Deterministic. */
@Component
public class ProductScorer {

    private final RecommendationWeights w;

    public ProductScorer(RecommendationWeights weights) {
        this.w = weights;
    }

    public ScoredProduct score(ProductDto p, GiftPreferences prefs) {
        List<Match> matches = new ArrayList<>();
        double price = p.price().doubleValue();
        if (prefs.occasion() != null && p.occasion().contains(prefs.occasion())) {
            matches.add(new Match(Signal.OCCASION, prefs.occasion(), w.occasion()));
        }
        if (prefs.hasBudget()) {
            if (price <= prefs.budget()) {
                matches.add(new Match(Signal.WITHIN_BUDGET, null, w.withinBudget()));
                if (price <= prefs.budget() * w.comfortableShare()) {
                    matches.add(new Match(Signal.COMFORTABLY_IN_BUDGET, null, w.comfortablyInBudget()));
                }
            } else {
                matches.add(new Match(Signal.OVER_BUDGET, null, w.overBudget()));
            }
        }
        if (prefs.recipient() != null && p.relationship().contains(prefs.recipient())) {
            matches.add(new Match(Signal.RECIPIENT, prefs.recipient(), w.recipient()));
        }
        if (prefs.interests().contains(p.category())) {
            matches.add(new Match(Signal.INTEREST, p.category(), w.interest()));
        }
        if (prefs.personality() != null && p.personality().contains(prefs.personality())) {
            matches.add(new Match(Signal.PERSONALITY, prefs.personality(), w.personality()));
        }
        double ratingBonus = Math.max(0, Math.min((p.rating().doubleValue() - 4.0) * w.ratingPerPoint(), w.maxRatingBonus()));
        if (ratingBonus > 0) {
            matches.add(new Match(Signal.RATING, null, ratingBonus));
        }
        double score = 0;
        for (Match m : matches) {
            score += m.points();
        }
        return new ScoredProduct(p, score, matches);
    }
}
