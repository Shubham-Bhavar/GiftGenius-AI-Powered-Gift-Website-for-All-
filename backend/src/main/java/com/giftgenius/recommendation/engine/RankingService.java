package com.giftgenius.recommendation.engine;

import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Component;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.recommendation.model.Match;
import com.giftgenius.recommendation.model.ScoredProduct;
import com.giftgenius.recommendation.model.Signal;

/** Orders candidates. Ties keep catalogue order (the sort is stable), so results are deterministic. */
@Component
public class RankingService {

    private static final Comparator<ScoredProduct> BEST_FIRST = Comparator.comparingDouble(ScoredProduct::score).reversed()
            .thenComparing(s -> s.product().rating(), Comparator.reverseOrder());

    /** Products that earned points, best first. */
    public List<ScoredProduct> rank(List<ScoredProduct> scored) {
        return scored.stream().filter(s -> s.score() > 0).sorted(BEST_FIRST).toList();
    }

    /** When nothing matched: the highest-rated, most-reviewed products. */
    public List<ScoredProduct> topRated(List<ProductDto> products) {
        return products.stream()
                .sorted(Comparator.comparing(ProductDto::rating).reversed()
                        .thenComparing(ProductDto::reviewCount, Comparator.reverseOrder()))
                .map(p -> new ScoredProduct(p, 0, List.of(new Match(Signal.TOP_RATED, null, 0))))
                .toList();
    }
}
