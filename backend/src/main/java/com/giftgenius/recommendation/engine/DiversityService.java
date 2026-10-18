package com.giftgenius.recommendation.engine;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.giftgenius.recommendation.model.ScoredProduct;

/**
 * Picks the final set from the ranking so it isn't four of the same thing: each next pick is the candidate with the
 * best score after a penalty for every earlier pick in its category, and from its marketplace seller (GiftGenius's
 * own products have no seller penalty). A clearly better product still wins; ties keep the ranking's order.
 */
@Component
public class DiversityService {

    private final RecommendationWeights weights;

    public DiversityService(RecommendationWeights weights) {
        this.weights = weights;
    }

    public List<ScoredProduct> select(List<ScoredProduct> ranked, int size) {
        List<ScoredProduct> pool = new ArrayList<>(ranked);
        List<ScoredProduct> picked = new ArrayList<>();
        Map<String, Integer> perCategory = new HashMap<>();
        Map<String, Integer> perSeller = new HashMap<>();
        while (picked.size() < size && !pool.isEmpty()) {
            int best = 0;
            double bestScore = Double.NEGATIVE_INFINITY;
            for (int i = 0; i < pool.size(); i++) {
                double adjusted = adjusted(pool.get(i), perCategory, perSeller);
                if (adjusted > bestScore) { // strictly better, so ties keep the ranking's order
                    best = i;
                    bestScore = adjusted;
                }
            }
            ScoredProduct choice = pool.remove(best);
            picked.add(choice);
            perCategory.merge(choice.product().category(), 1, Integer::sum);
            String seller = sellerOf(choice);
            if (seller != null) {
                perSeller.merge(seller, 1, Integer::sum);
            }
        }
        return picked;
    }

    private double adjusted(ScoredProduct s, Map<String, Integer> perCategory, Map<String, Integer> perSeller) {
        String seller = sellerOf(s);
        return s.score()
                - weights.variety().categoryRepeat() * perCategory.getOrDefault(s.product().category(), 0)
                - weights.variety().sellerRepeat() * (seller == null ? 0 : perSeller.getOrDefault(seller, 0));
    }

    private static String sellerOf(ScoredProduct s) {
        return s.product().seller() == null ? null : s.product().seller().slug();
    }
}
