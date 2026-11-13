package com.giftgenius.recommendation.service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.recommendation.engine.CandidateGenerator;
import com.giftgenius.recommendation.engine.DiversityService;
import com.giftgenius.recommendation.engine.ExplanationService;
import com.giftgenius.recommendation.engine.PersonalizationProvider;
import com.giftgenius.recommendation.engine.PlanKind;
import com.giftgenius.recommendation.engine.PopularitySignals;
import com.giftgenius.recommendation.engine.ProductScorer;
import com.giftgenius.recommendation.engine.RankingService;
import com.giftgenius.recommendation.model.GiftPlan;
import com.giftgenius.recommendation.model.GiftPreferences;
import com.giftgenius.recommendation.model.ScoredProduct;
import com.giftgenius.recommendation.model.Shortlist;
import com.giftgenius.recommendation.model.Shortlist.Outcome;

/**
 * The GiftGenius recommendation engine: deterministic, explainable, and independent of any AI.
 * <pre>
 * preferences (already normalised) → candidates (real, purchasable, within budget, not on the avoid list)
 *     → score → rank → select a varied set → explain and match
 * </pre>
 * When nothing fits, it falls back to the best products on quality within the budget, and says so in the outcome.
 * For a set budget it also plans one gift of each {@link PlanKind}.
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
        List<ProductDto> allowed = candidates.withoutAvoided(affordable, prefs);
        if (allowed.isEmpty()) {
            return new Shortlist(List.of(), Outcome.EVERYTHING_AVOIDED);
        }
        List<ScoredProduct> scored = score(allowed, prefs);
        List<ScoredProduct> ranked = ranking.rank(scored);
        Outcome outcome = Outcome.MATCHED;
        if (ranked.stream().noneMatch(ScoredProduct::fits)) {
            // Nothing fits what they asked for (or they told us nothing): the best gifts on quality, said honestly.
            ranked = ranking.topRated(scored);
            outcome = Outcome.TOP_RATED;
        }
        return new Shortlist(explanations.explain(diversity.select(ranked, size), prefs), outcome);
    }

    /**
     * The budget planner: one practical, one emotional and one experience gift, each priced at or under the budget
     * (no tolerance: a plan never goes over), never on the avoid list, and never the same product twice. Each is the
     * best fit of its kind. A kind with nothing within the budget is listed as missing. Empty without a budget.
     */
    public Optional<GiftPlan> plan(GiftPreferences prefs) {
        if (!prefs.hasBudget()) {
            return Optional.empty();
        }
        List<ProductDto> allowed = candidates.withoutAvoided(
                candidates.strictlyWithinBudget(candidates.catalog(), prefs.budget()), prefs);
        List<ScoredProduct> ranked = ranking.rank(score(allowed, prefs));
        List<GiftPlan.Option> options = new ArrayList<>();
        List<String> missing = new ArrayList<>();
        Set<Long> used = new HashSet<>();
        for (PlanKind kind : PlanKind.values()) {
            Optional<ScoredProduct> best = ranked.stream()
                    .filter(s -> kind.includes(s.product()) && !used.contains(s.product().id())).findFirst();
            if (best.isPresent()) {
                used.add(best.get().product().id());
                options.add(new GiftPlan.Option(kind.key(), explanations.explain(List.of(best.get()), prefs).get(0)));
            } else {
                missing.add(kind.key());
            }
        }
        return Optional.of(new GiftPlan(prefs.budget(), options, missing));
    }

    private List<ScoredProduct> score(List<ProductDto> products, GiftPreferences prefs) {
        return products.stream()
                .map(p -> scorer.score(p, prefs, popularity.of(p.id()), personalization.boost(prefs, p)))
                .toList();
    }
}
