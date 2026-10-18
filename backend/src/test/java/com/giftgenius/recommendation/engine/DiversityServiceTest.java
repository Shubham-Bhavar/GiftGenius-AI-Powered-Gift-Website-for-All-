package com.giftgenius.recommendation.engine;

import static com.giftgenius.recommendation.ProductFixture.product;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.giftgenius.recommendation.model.Match;
import com.giftgenius.recommendation.model.ScoredProduct;
import com.giftgenius.recommendation.model.Signal;

class DiversityServiceTest {

    private final DiversityService diversity = new DiversityService(RecommendationWeights.defaults());

    private static ScoredProduct scored(long id, String category, String seller, double score) {
        return new ScoredProduct(product(id).category(category).seller(seller).build(), score,
                List.of(new Match(Signal.OCCASION, "birthday", score)));
    }

    private static List<Long> ids(List<ScoredProduct> picked) {
        return picked.stream().map(s -> s.product().id()).toList();
    }

    @Test
    void notFourOfTheSameKind() {
        List<ScoredProduct> ranked = List.of(
                scored(1, "fragrance", null, 100), scored(2, "fragrance", null, 98), scored(3, "fragrance", null, 96),
                scored(4, "fragrance", null, 94), scored(5, "flowers", null, 90), scored(6, "wellness", null, 85),
                scored(7, "accessories", null, 70));
        // 1; then flowers 90 beats a second perfume (98 − 12); then a second perfume (86) beats wellness (85);
        // then wellness (85) beats a third perfume (96 − 24).
        assertThat(ids(diversity.select(ranked, 4))).containsExactly(1L, 5L, 2L, 6L);
    }

    @Test
    void aClearlyBetterProductStillWins() {
        List<ScoredProduct> ranked = List.of(scored(1, "fragrance", null, 100), scored(2, "fragrance", null, 95),
                scored(3, "flowers", null, 60));
        assertThat(ids(diversity.select(ranked, 2))).containsExactly(1L, 2L);
    }

    @Test
    void notTheSameSellerRepeatedly() {
        List<ScoredProduct> ranked = List.of(scored(1, "a", "asha-crafts", 100), scored(2, "b", "asha-crafts", 95),
                scored(3, "c", "ravi-gifts", 90));
        assertThat(ids(diversity.select(ranked, 3))).containsExactly(1L, 3L, 2L);
    }

    @Test
    void giftGeniusOwnProductsHaveNoSellerPenalty() {
        List<ScoredProduct> ranked = List.of(scored(1, "a", null, 100), scored(2, "b", null, 95),
                scored(3, "c", "ravi-gifts", 94));
        assertThat(ids(diversity.select(ranked, 3))).containsExactly(1L, 2L, 3L);
    }

    @Test
    void tiesKeepTheRankingOrderAndScoresAreUnchanged() {
        List<ScoredProduct> ranked = List.of(scored(1, "a", null, 50), scored(2, "b", null, 50),
                scored(3, "c", null, 50));
        List<ScoredProduct> picked = diversity.select(ranked, 3);
        assertThat(ids(picked)).containsExactly(1L, 2L, 3L);
        assertThat(picked).extracting(ScoredProduct::score).containsOnly(50.0);
        assertThat(picked).isEqualTo(ranked);
    }

    @Test
    void fewerCandidatesThanRequested() {
        assertThat(ids(diversity.select(List.of(scored(1, "a", null, 10)), 4))).containsExactly(1L);
        assertThat(diversity.select(List.of(), 4)).isEmpty();
    }
}
