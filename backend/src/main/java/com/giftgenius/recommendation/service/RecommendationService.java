package com.giftgenius.recommendation.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.recommendation.engine.CandidateGenerator;
import com.giftgenius.recommendation.engine.DiversityService;
import com.giftgenius.recommendation.engine.ExplanationService;
import com.giftgenius.recommendation.engine.ProductScorer;
import com.giftgenius.recommendation.engine.RankingService;
import com.giftgenius.recommendation.model.GiftPreferences;
import com.giftgenius.recommendation.model.Recommendation;
import com.giftgenius.recommendation.model.ScoredProduct;
import com.giftgenius.recommendation.model.Shortlist;
import com.giftgenius.recommendation.model.Shortlist.Outcome;

/**
 * The GiftGenius recommendation engine: deterministic and explainable, and it needs no AI.
 * candidates (real, purchasable, within budget) → score → rank → select → explain.
 */
@Service
public class RecommendationService {

    private final CandidateGenerator candidates;
    private final ProductScorer scorer;
    private final RankingService ranking;
    private final DiversityService diversity;
    private final ExplanationService explanations;

    public RecommendationService(CandidateGenerator candidates, ProductScorer scorer, RankingService ranking,
            DiversityService diversity, ExplanationService explanations) {
        this.candidates = candidates;
        this.scorer = scorer;
        this.ranking = ranking;
        this.diversity = diversity;
        this.explanations = explanations;
    }

    /** Up to {@code size} recommendations for these preferences, best first, each with its reasons. */
    public Shortlist shortlist(GiftPreferences prefs, int size) {
        List<ProductDto> catalog = candidates.catalog();
        if (catalog.isEmpty()) {
            return new Shortlist(List.of(), Outcome.CATALOG_EMPTY);
        }
        List<ProductDto> affordable = candidates.candidates(catalog, prefs);
        List<ScoredProduct> ranked = ranking.rank(affordable.stream().map(p -> scorer.score(p, prefs)).toList());
        Outcome outcome = Outcome.MATCHED;
        if (ranked.isEmpty()) {
            if (affordable.isEmpty()) {
                return new Shortlist(List.of(), Outcome.NOTHING_IN_BUDGET);
            }
            ranked = ranking.topRated(affordable);
            outcome = Outcome.TOP_RATED;
        }
        List<Recommendation> items = diversity.select(ranked, size).stream()
                .map(s -> new Recommendation(s.product(), s.score(), explanations.reasons(s)))
                .toList();
        return new Shortlist(items, outcome);
    }
}
