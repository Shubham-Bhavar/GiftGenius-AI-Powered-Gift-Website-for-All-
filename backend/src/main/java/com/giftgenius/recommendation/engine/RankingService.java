package com.giftgenius.recommendation.engine;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Component;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.recommendation.model.Match;
import com.giftgenius.recommendation.model.ScoredProduct;
import com.giftgenius.recommendation.model.Signal;

/** Orders candidates, fully deterministically: score, then rating, then review count, then product id. */
@Component
public class RankingService {

    private static final Comparator<ProductDto> BETTER_PRODUCT = Comparator.comparing(ProductDto::rating).reversed()
            .thenComparing(ProductDto::reviewCount, Comparator.reverseOrder())
            .thenComparing(ProductDto::id);

    /** Products that earned points, best first. */
    public List<ScoredProduct> rank(List<ScoredProduct> scored) {
        return scored.stream().filter(s -> s.score() > 0)
                .sorted(Comparator.comparingDouble(ScoredProduct::score).reversed()
                        .thenComparing(ScoredProduct::product, BETTER_PRODUCT))
                .toList();
    }

    /**
     * When nothing fits what the shopper asked for: the best products on quality alone (rating with the cold-start
     * prior, review volume, recent sales), scored by that quality. Only being over budget is kept, so it is still said.
     */
    public List<ScoredProduct> topRated(List<ScoredProduct> scored) {
        return scored.stream()
                .sorted(Comparator.comparingDouble(ScoredProduct::quality).reversed()
                        .thenComparing(ScoredProduct::product, BETTER_PRODUCT))
                .map(s -> {
                    List<Match> matches = new ArrayList<>();
                    matches.add(new Match(Signal.TOP_RATED, null, 0));
                    s.matches().stream().filter(m -> m.signal() == Signal.OVER_BUDGET)
                            .map(m -> new Match(m.signal(), m.value(), 0)).forEach(matches::add);
                    return new ScoredProduct(s.product(), s.quality(), matches);
                })
                .toList();
    }
}
