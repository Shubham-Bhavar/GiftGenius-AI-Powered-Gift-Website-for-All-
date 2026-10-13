package com.giftgenius.recommendation.engine;

import static com.giftgenius.recommendation.ProductFixture.product;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.giftgenius.recommendation.ProductFixture;
import com.giftgenius.recommendation.model.Match;
import com.giftgenius.recommendation.model.ScoredProduct;
import com.giftgenius.recommendation.model.Signal;

class RankingServiceTest {

    private final RankingService ranking = new RankingService();

    private static ScoredProduct scored(ProductFixture p, double score) {
        return new ScoredProduct(p.build(), score, List.of(new Match(Signal.OCCASION, "birthday", score)));
    }

    private static List<Long> ids(List<ScoredProduct> ranked) {
        return ranked.stream().map(s -> s.product().id()).toList();
    }

    @Test
    void onlyProductsThatEarnedPoints() {
        assertThat(ids(ranking.rank(List.of(scored(product(1), 0), scored(product(2), -5), scored(product(3), 10)))))
                .containsExactly(3L);
    }

    @Test
    void bestScoreFirstThenRatingThenReviewsThenId() {
        List<ScoredProduct> scored = List.of(
                scored(product(1).rating(4.5, 10), 50),
                scored(product(4).rating(4.8, 99), 50),
                scored(product(2).rating(4.8, 10), 50),
                scored(product(5), 70),
                scored(product(3).rating(4.8, 99), 50));
        assertThat(ids(ranking.rank(scored))).containsExactly(5L, 3L, 4L, 2L, 1L);
    }

    @Test
    void topRatedOrdersByQualityAndKeepsOnlyTheBudgetCaveat() {
        ScoredProduct overBudget = new ScoredProduct(product(1).build(), -16, List.of(new Match(Signal.RATING, null, 3),
                new Match(Signal.REVIEWS, null, 1), new Match(Signal.OVER_BUDGET, null, -20)));
        ScoredProduct popular = new ScoredProduct(product(2).build(), 9, List.of(new Match(Signal.RATING, null, 7),
                new Match(Signal.POPULARITY, null, 2)));

        List<ScoredProduct> top = ranking.topRated(List.of(overBudget, popular));

        assertThat(ids(top)).containsExactly(2L, 1L);
        assertThat(top.get(0).score()).isEqualTo(9.0);
        assertThat(top.get(0).matches()).containsExactly(new Match(Signal.TOP_RATED, null, 0));
        assertThat(top.get(1).score()).isEqualTo(4.0);
        assertThat(top.get(1).matches()).containsExactly(new Match(Signal.TOP_RATED, null, 0),
                new Match(Signal.OVER_BUDGET, null, 0));
    }
}
