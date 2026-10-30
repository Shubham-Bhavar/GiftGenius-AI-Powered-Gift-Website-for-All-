package com.giftgenius.giftbox;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.giftbox.GiftBoxDtos.Box;
import com.giftgenius.giftbox.GiftBoxDtos.BoxItem;
import com.giftgenius.giftbox.GiftBoxDtos.CheckRequest;
import com.giftgenius.giftbox.GiftBoxDtos.CheckResponse;
import com.giftgenius.giftbox.GiftBoxDtos.SuggestionRequest;
import com.giftgenius.giftbox.GiftBoxDtos.SuggestionResponse;
import com.giftgenius.recommendation.engine.CandidateGenerator;
import com.giftgenius.recommendation.engine.ExplanationService;
import com.giftgenius.recommendation.engine.PersonalizationProvider;
import com.giftgenius.recommendation.engine.PopularitySignals;
import com.giftgenius.recommendation.engine.PreferenceNormalizer;
import com.giftgenius.recommendation.engine.ProductScorer;
import com.giftgenius.recommendation.engine.RankingService;
import com.giftgenius.recommendation.model.GiftPreferences;
import com.giftgenius.recommendation.model.Recommendation;
import com.giftgenius.recommendation.model.ScoredProduct;

/**
 * The multi-gift box composer: several gifts that together fit one budget, chosen by the recommendation engine (no
 * model), plus a compatibility check for any box the shopper puts together (see {@link BoxCompatibility}).
 * <p>
 * Suggestions come from the best-fitting purchasable gifts priced within the budget, never on the avoid list. Every
 * combination of the requested size with one gift per category and a total within the budget is valued by its gifts'
 * engine scores plus a small reward for using the budget, and the best few that differ from each other are returned.
 */
@Service
public class GiftBoxService {

    static final int DEFAULT_SIZE = 3;
    /** Boxes are built from this many of the best-fitting gifts. */
    private static final int POOL = 14;
    private static final int BOXES = 3;
    /** Points for spending the whole budget; a box using half of it gets half. */
    private static final double BUDGET_USE_POINTS = 20;

    private final CandidateGenerator candidates;
    private final ProductScorer scorer;
    private final RankingService ranking;
    private final ExplanationService explanations;
    private final PopularitySignals popularity;
    private final PersonalizationProvider personalization;
    private final PreferenceNormalizer normalizer;

    public GiftBoxService(CandidateGenerator candidates, ProductScorer scorer, RankingService ranking,
            ExplanationService explanations, PopularitySignals popularity, PersonalizationProvider personalization,
            PreferenceNormalizer normalizer) {
        this.candidates = candidates;
        this.scorer = scorer;
        this.ranking = ranking;
        this.explanations = explanations;
        this.popularity = popularity;
        this.personalization = personalization;
        this.normalizer = normalizer;
    }

    public SuggestionResponse suggest(SuggestionRequest req) {
        int size = req.size() == null ? DEFAULT_SIZE : req.size();
        int budget = req.budget();
        GiftPreferences prefs = normalizer.normalize(req.recipient(), req.occasion(), budget, req.interests(),
                req.personality(), req.avoid());
        List<ScoredProduct> pool = ranking.rank(candidates.withoutAvoided(
                candidates.strictlyWithinBudget(candidates.catalog(), budget), prefs).stream()
                .map(p -> scorer.score(p, prefs, popularity.of(p.id()), personalization.boost(prefs, p)))
                .toList()).stream().limit(POOL).toList();

        List<List<ScoredProduct>> combos = new ArrayList<>();
        combine(pool, size, 0, new ArrayList<>(), budget, combos);
        combos.sort(Comparator.<List<ScoredProduct>>comparingDouble(c -> -value(c, budget))
                .thenComparing(GiftBoxService::idKey));

        List<Box> boxes = new ArrayList<>();
        List<Set<Long>> chosen = new ArrayList<>();
        for (List<ScoredProduct> combo : combos) {
            if (boxes.size() == BOXES) {
                break;
            }
            Set<Long> ids = combo.stream().map(s -> s.product().id()).collect(Collectors.toSet());
            // Each box differs from the others by at least two gifts, so the choices are real choices.
            if (chosen.stream().anyMatch(c -> overlap(c, ids) > size - 2)) {
                continue;
            }
            chosen.add(ids);
            boxes.add(box(combo, prefs, budget));
        }
        String note = boxes.isEmpty() ? "There aren't " + size + " different kinds of gift within "
                + ExplanationService.rupees(budget) + " yet. Try a bigger budget or fewer gifts." : null;
        return new SuggestionResponse(budget, boxes, note);
    }

    public CheckResponse check(CheckRequest req) {
        Map<Long, ProductDto> byId = candidates.catalog().stream()
                .collect(Collectors.toMap(ProductDto::id, Function.identity(), (a, b) -> a));
        List<ProductDto> items = req.productIds().stream().map(byId::get).filter(Objects::nonNull).toList();
        List<Long> missing = req.productIds().stream().filter(id -> !byId.containsKey(id)).distinct().toList();
        GiftPreferences prefs = normalizer.normalize(req.recipient(), req.occasion(), req.budget(), List.of(), null);
        return new CheckResponse(BoxCompatibility.total(items), req.budget(),
                BoxCompatibility.check(items, req.budget(), prefs.occasion(), prefs.forWhom()), missing);
    }

    /** Every combination of {@code size} gifts, one per category, whose total is within the budget. */
    private static void combine(List<ScoredProduct> pool, int size, int from, List<ScoredProduct> current, int budget,
            List<List<ScoredProduct>> out) {
        if (current.size() == size) {
            out.add(List.copyOf(current));
            return;
        }
        for (int i = from; i < pool.size(); i++) {
            ScoredProduct next = pool.get(i);
            boolean sameKind = current.stream().anyMatch(s -> s.product().category().equals(next.product().category()));
            if (!sameKind && BoxCompatibility.total(products(current)) + price(next) <= budget) {
                current.add(next);
                combine(pool, size, i + 1, current, budget, out);
                current.remove(current.size() - 1);
            }
        }
    }

    private Box box(List<ScoredProduct> combo, GiftPreferences prefs, int budget) {
        // Explained alongside each other, so each reason says what that gift adds to the box.
        List<Recommendation> explained = explanations.explain(combo, prefs);
        List<ProductDto> products = products(combo);
        return new Box(explained.stream().map(r -> new BoxItem(r.product(), r.summary())).toList(),
                BoxCompatibility.total(products),
                BoxCompatibility.check(products, budget, prefs.occasion(), prefs.forWhom()));
    }

    private static double value(List<ScoredProduct> combo, int budget) {
        double fit = combo.stream().mapToDouble(ScoredProduct::score).sum();
        return fit + BUDGET_USE_POINTS * BoxCompatibility.total(products(combo)) / budget;
    }

    private static String idKey(List<ScoredProduct> combo) {
        return combo.stream().map(s -> String.format("%012d", s.product().id())).collect(Collectors.joining(","));
    }

    private static long overlap(Set<Long> a, Set<Long> b) {
        Set<Long> both = new HashSet<>(a);
        both.retainAll(b);
        return both.size();
    }

    private static List<ProductDto> products(List<ScoredProduct> scored) {
        return scored.stream().map(ScoredProduct::product).toList();
    }

    private static int price(ScoredProduct s) {
        return BoxCompatibility.total(List.of(s.product()));
    }
}
