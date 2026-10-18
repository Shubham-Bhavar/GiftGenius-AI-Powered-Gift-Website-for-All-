package com.giftgenius.recommendation.service;

import static com.giftgenius.recommendation.ProductFixture.product;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.giftgenius.TestProducts;
import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.catalog.service.ProductService;
import com.giftgenius.order.repository.OrderItemRepository;
import com.giftgenius.recommendation.TestRecommendations;
import com.giftgenius.recommendation.engine.PreferenceNormalizer;
import com.giftgenius.recommendation.model.GiftPreferences;
import com.giftgenius.recommendation.model.Recommendation;
import com.giftgenius.recommendation.model.Shortlist;
import com.giftgenius.recommendation.model.Shortlist.Outcome;

/** The whole engine over a small catalogue: every expectation is exact, because the engine is deterministic. */
class RecommendationServiceTest {

    private final ProductService products = mock(ProductService.class);
    private final OrderItemRepository sales = mock(OrderItemRepository.class);
    private final RecommendationService engine = TestRecommendations.service(products, sales);
    private final PreferenceNormalizer normalizer = new PreferenceNormalizer();

    private GiftPreferences prefs(String recipient, String occasion, Integer budget, List<String> interests,
            String personality) {
        return normalizer.normalize(recipient, occasion, budget, interests, personality);
    }

    private Shortlist shortlist(List<ProductDto> catalog, GiftPreferences prefs, int size) {
        when(products.purchasableCatalog()).thenReturn(catalog);
        return engine.shortlist(prefs, size);
    }

    private List<Recommendation> rank(GiftPreferences prefs, int size) {
        return shortlist(TestProducts.catalog(), prefs, size).items();
    }

    private static List<String> names(List<Recommendation> items) {
        return items.stream().map(r -> r.product().name()).toList();
    }

    private static List<Long> ids(Shortlist s) {
        return s.items().stream().map(r -> r.product().id()).toList();
    }

    @Test
    void anniversaryForPartnerWithFragranceInterestRanksPerfumeFirst() {
        List<Recommendation> ranked = rank(prefs("partner", "anniversary", 1500, List.of("fragrance"), "expressive"), 4);
        assertThat(ranked.get(0).product().name()).isEqualTo("Signature Perfume");
        assertThat(ranked.get(1).product().name()).isEqualTo("Luxury Hamper Box");
    }

    @Test
    void overBudgetItemsArePenalised() {
        assertThat(names(rank(prefs("friend", "birthday", 500, List.of(), null), 5)))
                .doesNotContain("Wireless Earbuds Premium");
    }

    @Test
    void reasonsExplainTheMatch() {
        Recommendation top = rank(prefs("mom", "Diwali", null, List.of("art"), null), 1).get(0);
        assertThat(top.product().name()).isEqualTo("Handmade Warli Art Frame");
        assertThat(top.reasons()).containsExactly("made for festive celebrations", "a favourite for parents",
                "matches their love of art and culture");
        assertThat(top.summary()).isEqualTo(
                "Made for festive celebrations, a favourite for parents and matches their love of art and culture.");
    }

    @Test
    void slightlyOverBudgetItemsAreAllowedButRankedLower() {
        // Hamper is ₹499: 10% over a ₹455 budget is within tolerance.
        List<Recommendation> ranked = rank(prefs(null, "birthday", 455, List.of(), null), 5);
        assertThat(names(ranked)).containsExactly("Artisan Chocolate Box", "Luxury Hamper Box");
        assertThat(ranked.get(1).summary()).isEqualTo("Made for birthdays, just over your ₹455 budget.");
    }

    @Test
    void aVariedSetRatherThanFourOfTheSameThing() {
        List<ProductDto> catalog = List.of(
                perfume(1, 4.8), perfume(2, 4.7), perfume(3, 4.6), perfume(6, 4.5),
                product(4).category("flowers").price(1200).occasions("anniversary").relationships("partner")
                        .forWhom("her").rating(4.6, 100).build(),
                product(5).category("wellness").price(1500).occasions("anniversary").rating(4.5, 100).build());
        Shortlist s = shortlist(catalog, prefs("wife", "anniversary", 2000, List.of("perfume"), null), 4);
        // On score alone it would be four perfumes (1, 2, 3, 6); the flowers move up past the third.
        assertThat(ids(s)).containsExactly(1L, 2L, 4L, 3L);
        assertThat(s.outcome()).isEqualTo(Outcome.MATCHED);
    }

    private static ProductDto perfume(long id, double rating) {
        return product(id).category("fragrance").price(1500).occasions("anniversary").relationships("partner")
                .forWhom("her").rating(rating, 100).build();
    }

    @Test
    void bestsellersRiseAndSaySo() {
        GiftPreferences birthday = prefs(null, "birthday", null, null, null);
        assertThat(rank(birthday, 1).get(0).product().name()).isEqualTo("Luxury Hamper Box");

        when(sales.unitsSoldSince(any(), anyCollection()))
                .thenReturn(List.of(new Object[] { 6L, 30L }, new Object[] { 1L, 3L }));
        RecommendationService withSales = TestRecommendations.service(products, sales);
        Recommendation top = withSales.shortlist(birthday, 1).items().get(0);
        assertThat(top.product().name()).isEqualTo("Artisan Chocolate Box");
        assertThat(top.reasons()).contains("a bestseller right now");
    }

    @Test
    void aBudgetAloneIsEnoughToMatch() {
        Shortlist s = shortlist(TestProducts.catalog(), prefs(null, null, 700, null, null), 5);
        assertThat(s.outcome()).isEqualTo(Outcome.MATCHED);
        assertThat(ids(s)).containsExactly(1L, 6L, 12L);
    }

    @Test
    void whenNothingFitsTheBestRatedAreOfferedHonestly() {
        Shortlist s = shortlist(TestProducts.catalog(), prefs(null, "retirement", null, null, null), 3);
        assertThat(s.outcome()).isEqualTo(Outcome.TOP_RATED);
        assertThat(ids(s)).containsExactly(1L, 4L, 12L);
        assertThat(s.items()).extracting(Recommendation::summary).containsOnly("One of our highest-rated gifts.");
    }

    @Test
    void aShopperWhoToldUsNothingGetsTheBestRated() {
        Shortlist s = shortlist(TestProducts.catalog(), prefs(null, null, null, null, null), 3);
        assertThat(s.outcome()).isEqualTo(Outcome.TOP_RATED);
        assertThat(ids(s)).containsExactly(1L, 4L, 12L);
    }

    @Test
    void nothingInBudget() {
        Shortlist s = shortlist(TestProducts.catalog(), prefs(null, "birthday", 100, null, null), 3);
        assertThat(s.outcome()).isEqualTo(Outcome.NOTHING_IN_BUDGET);
        assertThat(s.items()).isEmpty();
    }

    @Test
    void anEmptyCatalogue() {
        Shortlist s = shortlist(List.of(), prefs(null, "birthday", null, null, null), 3);
        assertThat(s.outcome()).isEqualTo(Outcome.CATALOG_EMPTY);
        assertThat(s.items()).isEmpty();
    }

    @Test
    void everyRecommendationIsExplainedAndTheResultIsAlwaysTheSame() {
        GiftPreferences p = prefs("sister", "bday", 1500, List.of("chocolates", "perfume"), "fun");
        Shortlist first = shortlist(TestProducts.catalog(), p, 4);
        assertThat(first.items()).allSatisfy(r -> assertThat(r.summary()).isNotBlank().endsWith("."));
        assertThat(shortlist(TestProducts.catalog(), p, 4)).isEqualTo(first);
    }
}
