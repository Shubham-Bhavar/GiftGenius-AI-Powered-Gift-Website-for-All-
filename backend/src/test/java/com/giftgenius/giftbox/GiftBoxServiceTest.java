package com.giftgenius.giftbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.giftgenius.TestProducts;
import com.giftgenius.catalog.service.ProductService;
import com.giftgenius.giftbox.GiftBoxDtos.Box;
import com.giftgenius.giftbox.GiftBoxDtos.BoxCheck;
import com.giftgenius.giftbox.GiftBoxDtos.CheckRequest;
import com.giftgenius.giftbox.GiftBoxDtos.CheckResponse;
import com.giftgenius.giftbox.GiftBoxDtos.SuggestionRequest;
import com.giftgenius.giftbox.GiftBoxDtos.SuggestionResponse;
import com.giftgenius.order.repository.OrderItemRepository;
import com.giftgenius.recommendation.engine.CandidateGenerator;
import com.giftgenius.recommendation.engine.ExplanationService;
import com.giftgenius.recommendation.engine.NoPersonalization;
import com.giftgenius.recommendation.engine.PopularitySignals;
import com.giftgenius.recommendation.engine.PreferenceNormalizer;
import com.giftgenius.recommendation.engine.ProductScorer;
import com.giftgenius.recommendation.engine.RankingService;
import com.giftgenius.recommendation.engine.RecommendationWeights;

/**
 * Boxes over the small test catalogue: the hamper (₹499), perfume (₹1,199), chocolates (₹299), earbuds (₹1,999) and
 * Warli frame (₹649), one of each category.
 */
class GiftBoxServiceTest {

    private final ProductService products = mock(ProductService.class);
    private GiftBoxService service;

    @BeforeEach
    void setUp() {
        when(products.purchasableCatalog()).thenReturn(TestProducts.catalog());
        RecommendationWeights w = RecommendationWeights.defaults();
        service = new GiftBoxService(new CandidateGenerator(products, w), new ProductScorer(w), new RankingService(),
                new ExplanationService(w), new PopularitySignals(mock(OrderItemRepository.class), w),
                new NoPersonalization(), new PreferenceNormalizer());
    }

    private static SuggestionRequest request(int budget, Integer size, List<String> avoid) {
        return new SuggestionRequest(budget, "partner", "anniversary", List.of("fragrance"), null, avoid, size);
    }

    private static List<String> names(Box box) {
        return box.items().stream().map(i -> i.product().name()).toList();
    }

    @Test
    void aBoxIsDifferentKindsOfGiftThatTogetherFitTheBudget() {
        SuggestionResponse res = service.suggest(request(1500, 3, null));
        // The only three different gifts that fit ₹1,500 together.
        assertThat(res.boxes()).singleElement().satisfies(box -> {
            assertThat(names(box)).containsExactlyInAnyOrder("Luxury Hamper Box", "Artisan Chocolate Box",
                    "Handmade Warli Art Frame");
            assertThat(box.total()).isEqualTo(1447);
            assertThat(box.items()).allSatisfy(i -> assertThat(i.reason()).isNotBlank());
            assertThat(box.checks()).contains(new BoxCheck("price", "good", "₹1,447 of your ₹1,500 budget (₹53 to spare)"));
        });
        assertThat(res.note()).isNull();
    }

    @Test
    void theBestFitComesFirstAndTheOthersAreRealAlternatives() {
        SuggestionResponse res = service.suggest(request(1500, 2, null));
        assertThat(res.boxes()).hasSizeGreaterThanOrEqualTo(2);
        assertThat(names(res.boxes().get(0))).contains("Signature Perfume"); // it fits the anniversary and the interest
        assertThat(res.boxes()).allSatisfy(b -> assertThat(b.total()).isLessThanOrEqualTo(1500));
        Set<String> seen = new HashSet<>();
        for (Box b : res.boxes()) {
            // Two-gift boxes never share a gift.
            assertThat(names(b)).allSatisfy(n -> assertThat(seen.add(n)).as(n).isTrue());
        }
    }

    @Test
    void nothingTheyDontLikeGoesInABox() {
        assertThat(service.suggest(request(1500, 2, List.of("perfume"))).boxes())
                .isNotEmpty().allSatisfy(b -> assertThat(names(b)).doesNotContain("Signature Perfume"));
    }

    @Test
    void anHonestNoteWhenTheBudgetCantFillABox() {
        SuggestionResponse res = service.suggest(request(400, 2, null)); // only the ₹299 chocolates fit
        assertThat(res.boxes()).isEmpty();
        assertThat(res.note()).isEqualTo(
                "There aren't 2 different kinds of gift within ₹400 yet. Try a bigger budget or fewer gifts.");
    }

    @Test
    void checkingAHandMadeBoxReportsWhatCantBeBought() {
        CheckResponse res = service.check(new CheckRequest(List.of(1L, 4L, 999L), 1500, "anniversary", null));
        assertThat(res.total()).isEqualTo(1698);
        assertThat(res.missing()).containsExactly(999L);
        assertThat(res.checks()).contains(new BoxCheck("occasion", "good", "Both are made for anniversaries"),
                new BoxCheck("price", "bad", "₹1,698: ₹198 over your ₹1,500 budget"));
    }
}
