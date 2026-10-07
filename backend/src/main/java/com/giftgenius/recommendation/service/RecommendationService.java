package com.giftgenius.recommendation.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.recommendation.engine.CandidateGenerator;
import com.giftgenius.recommendation.engine.DiversityService;
import com.giftgenius.recommendation.engine.ExplanationService;
import com.giftgenius.recommendation.engine.PersonalizationProvider;
import com.giftgenius.recommendation.engine.PopularitySignals;
import com.giftgenius.recommendation.engine.ProductScorer;
import com.giftgenius.recommendation.engine.RankingService;
import com.giftgenius.recommendation.model.GiftPreferences;
import com.giftgenius.recommendation.model.ScoredProduct;
import com.giftgenius.recommendation.model.Shortlist;
import com.giftgenius.recommendation.model.Shortlist.Outcome;

/**
 * The GiftGenius recommendation engine: deterministic, explainable, and independent of any AI.
 * <pre>
 * preferences (already normalised) → candidates (real, purchasable, within budget) → score → rank
 *     → select a varied set → explain
 * </pre>
 * When nothing fits, it falls back to the best products on quality within the budget, and says so in the outcome.
 */
@Service
public class RecommendationService {

    private final CandidateGenerator candidates;
    private final ProductScorer scorer;
    private final RankingService ranking;
    private final DiversityService diversity;
    private final ExplanationService explanations;
    private final PopularitySignals popularity;
    private final PersonalizationProvider personalization;

    public RecommendationService(CandidateGenerator candidates, ProductScorer scorer, RankingService ranking,
            DiversityService diversity, ExplanationService explanations, PopularitySignals popularity,
            PersonalizationProvider personalization) {
        this.candidates = candidates;
        this.scorer = scorer;
        this.ranking = ranking;
        this.diversity = diversity;
        this.explanations = explanations;
        this.popularity = popularity;
        this.personalization = personalization;
    }

    /** Up to {@code size} recommendations for these preferences, best first, each with its reasons. */
    public Shortlist shortlist(GiftPreferences prefs, int size) {
        List<ProductDto> catalog = candidates.catalog();
        if (catalog.isEmpty()) {
            return new Shortlist(List.of(), Outcome.CATALOG_EMPTY);
        }
        List<ProductDto> affordable = candidates.candidates(catalog, prefs);
        if (affordable.isEmpty()) {
            return new Shortlist(List.of(), Outcome.NOTHING_IN_BUDGET);
        }
        List<ScoredProduct> scored = affordable.stream()
                .map(p -> scorer.score(p, prefs, popularity.of(p.id()), personalization.boost(prefs, p)))
                .toList();
        List<ScoredProduct> ranked = ranking.rank(scored);
        Outcome outcome = Outcome.MATCHED;
        if (ranked.stream().noneMatch(ScoredProduct::fits)) {
            // Nothing fits what they asked for (or they told us nothing): the best gifts on quality, said honestly.
            ranked = ranking.topRated(scored);
            outcome = Outcome.TOP_RATED;
        }
        return new Shortlist(explanations.explain(diversity.select(ranked, size), prefs), outcome);
    }
}
