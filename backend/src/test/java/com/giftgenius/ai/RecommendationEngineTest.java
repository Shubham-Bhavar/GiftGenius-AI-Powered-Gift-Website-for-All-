package com.giftgenius.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.giftgenius.TestProducts;
import com.giftgenius.ai.RecommendationEngine.Criteria;
import com.giftgenius.ai.RecommendationEngine.Scored;

class RecommendationEngineTest {

    private final RecommendationEngine engine = new RecommendationEngine();

    @Test
    void anniversaryForPartnerWithFragranceInterestRanksPerfumeFirst() {
        Criteria c = new Criteria("partner", "anniversary", 1500, List.of("fragrance"), "expressive");
        List<Scored> ranked = engine.rank(TestProducts.catalog(), c, 4);
        assertThat(ranked.get(0).product().name()).isEqualTo("Signature Perfume");
        assertThat(ranked.get(1).product().name()).isEqualTo("Luxury Hamper Box");
    }

    @Test
    void overBudgetItemsArePenalised() {
        Criteria c = new Criteria("friend", "birthday", 500, List.of(), null);
        List<Scored> ranked = engine.rank(TestProducts.catalog(), c, 5);
        assertThat(ranked).extracting(s -> s.product().name()).doesNotContain("Wireless Earbuds Premium");
    }

    @Test
    void reasonsExplainTheMatch() {
        Criteria c = new Criteria("parent", "festival", null, List.of("cultural"), null);
        Scored top = engine.rank(TestProducts.catalog(), c, 1).get(0);
        assertThat(top.product().name()).isEqualTo("Handmade Warli Art Frame");
        assertThat(top.reasons()).contains("Made for festive celebrations");
    }

    @Test
    void slightlyOverBudgetItemsAreAllowedButRankedLower() {
        // Hamper is ₹499: 10% over a ₹455 budget is within tolerance.
        Criteria c = new Criteria(null, "birthday", 455, List.of(), null);
        List<Scored> ranked = engine.rank(TestProducts.catalog(), c, 5);
        assertThat(ranked).extracting(s -> s.product().name())
                .contains("Luxury Hamper Box")
                .doesNotContain("Wireless Earbuds Premium");
        assertThat(ranked.get(0).product().name()).isEqualTo("Artisan Chocolate Box");
    }
}
