package com.giftgenius.recommendation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.giftgenius.TestProducts;
import com.giftgenius.catalog.service.ProductService;
import com.giftgenius.recommendation.TestRecommendations;
import com.giftgenius.recommendation.model.GiftPreferences;
import com.giftgenius.recommendation.model.Recommendation;

/** The engine's ranking, ported unchanged from the old ai/RecommendationEngineTest. */
class RecommendationServiceTest {

    private final ProductService products = mock(ProductService.class);
    private final RecommendationService engine = TestRecommendations.service(products);

    private List<Recommendation> rank(GiftPreferences c, int limit) {
        when(products.purchasableCatalog()).thenReturn(TestProducts.catalog());
        return engine.shortlist(c, limit).items();
    }

    @Test
    void anniversaryForPartnerWithFragranceInterestRanksPerfumeFirst() {
        GiftPreferences c = new GiftPreferences("partner", "anniversary", 1500, List.of("fragrance"), "expressive");
        List<Recommendation> ranked = rank(c, 4);
        assertThat(ranked.get(0).product().name()).isEqualTo("Signature Perfume");
        assertThat(ranked.get(1).product().name()).isEqualTo("Luxury Hamper Box");
    }

    @Test
    void overBudgetItemsArePenalised() {
        GiftPreferences c = new GiftPreferences("friend", "birthday", 500, List.of(), null);
        List<Recommendation> ranked = rank(c, 5);
        assertThat(ranked).extracting(s -> s.product().name()).doesNotContain("Wireless Earbuds Premium");
    }

    @Test
    void reasonsExplainTheMatch() {
        GiftPreferences c = new GiftPreferences("parent", "festival", null, List.of("cultural"), null);
        Recommendation top = rank(c, 1).get(0);
        assertThat(top.product().name()).isEqualTo("Handmade Warli Art Frame");
        assertThat(top.reasons()).contains("Made for festive celebrations");
    }

    @Test
    void slightlyOverBudgetItemsAreAllowedButRankedLower() {
        // Hamper is ₹499: 10% over a ₹455 budget is within tolerance.
        GiftPreferences c = new GiftPreferences(null, "birthday", 455, List.of(), null);
        List<Recommendation> ranked = rank(c, 5);
        assertThat(ranked).extracting(s -> s.product().name())
                .contains("Luxury Hamper Box")
                .doesNotContain("Wireless Earbuds Premium");
        assertThat(ranked.get(0).product().name()).isEqualTo("Artisan Chocolate Box");
    }
}
