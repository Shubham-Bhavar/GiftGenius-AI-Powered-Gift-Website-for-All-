package com.giftgenius.search.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.giftgenius.TestProducts;
import com.giftgenius.analytics.InteractionEvent;
import com.giftgenius.analytics.InteractionType;
import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.catalog.service.ProductService;
import com.giftgenius.common.ApiException;
import com.giftgenius.order.repository.OrderItemRepository;
import com.giftgenius.recommendation.engine.CandidateGenerator;
import com.giftgenius.recommendation.engine.PopularitySignals;
import com.giftgenius.recommendation.engine.PreferenceNormalizer;
import com.giftgenius.recommendation.engine.ProductScorer;
import com.giftgenius.recommendation.engine.RecommendationWeights;
import com.giftgenius.recommendation.engine.TextPreferenceParser;
import com.giftgenius.search.dto.SearchDtos.Interpreted;
import com.giftgenius.search.dto.SearchDtos.SearchHit;
import com.giftgenius.search.dto.SearchDtos.SearchResponse;

class SearchServiceTest {

    private final ProductService products = mock(ProductService.class);
    private final List<Object> events = new ArrayList<>();
    private SearchService search;

    @BeforeEach
    void setUp() {
        List<ProductDto> catalog = new ArrayList<>(TestProducts.catalog());
        catalog.add(TestProducts.product(20, "Classic Rose Bouquet", "flowers", 599, 4.6, List.of("valentine"),
                List.of("partner"), List.of("expressive")));
        catalog.add(TestProducts.product(21, "Ceramic Coffee Mugs (Set of 2)", "home decor", 449, 4.4, List.of(),
                List.of("friend"), List.of("practical")));
        when(products.purchasableCatalog()).thenReturn(catalog);
        RecommendationWeights w = RecommendationWeights.defaults();
        search = new SearchService(new CandidateGenerator(products, w), new ProductScorer(w),
                new PopularitySignals(mock(OrderItemRepository.class), w), new TextPreferenceParser(),
                new PreferenceNormalizer(), events::add);
    }

    private static List<Long> ids(SearchResponse res) {
        return res.results().content().stream().map(h -> h.product().id()).toList();
    }

    @Test
    void productWordsFindProductsBestMatchFirst() {
        assertThat(ids(search.search("perfume", 0, 10)).get(0)).isEqualTo(4L);
        assertThat(ids(search.search("chocolate box", 0, 10)).get(0)).isEqualTo(6L);
        // Singular and plural find each other.
        assertThat(ids(search.search("roses", 0, 10))).first().isEqualTo(20L);
        assertThat(ids(search.search("coffee mug", 0, 10))).first().isEqualTo(21L);
    }

    @Test
    void aGiftRequestIsReadForBudgetOccasionAndRecipient() {
        SearchResponse res = search.search("Birthday gift for my mom under ₹500", 0, 10);
        assertThat(res.interpreted()).isEqualTo(new Interpreted("parent", "birthday", 500, List.of(), null,
                List.of("birthday", "mom")));
        assertThat(ids(res)).first().isEqualTo(1L); // the hamper: a birthday gift for parents, within budget
        assertThat(res.results().content()).allSatisfy(h ->
                assertThat(h.product().price().intValue()).isLessThanOrEqualTo(575));
    }

    @Test
    void nothingMatchesNothing() {
        SearchResponse res = search.search("spaceship", 0, 10);
        assertThat(res.results().content()).isEmpty();
        assertThat(res.results().totalElements()).isZero();
        assertThat(res.results().totalPages()).isZero();
    }

    @Test
    void pagesThroughTheRankedResults() {
        SearchResponse all = search.search("birthday", 0, 50);
        assertThat(all.results().totalElements()).isEqualTo(3); // hamper, chocolates, earbuds
        SearchResponse first = search.search("birthday", 0, 2);
        SearchResponse second = search.search("birthday", 1, 2);
        assertThat(first.results().totalPages()).isEqualTo(2);
        assertThat(ids(first)).containsExactlyElementsOf(ids(all).subList(0, 2));
        assertThat(ids(second)).containsExactlyElementsOf(ids(all).subList(2, 3));
        assertThat(search.search("birthday", 9, 2).results().content()).isEmpty();
        assertThat(search.search("birthday", -1, 500).results().size()).isEqualTo(SearchService.MAX_SIZE);
    }

    @Test
    void theRankingIsDeterministic() {
        List<SearchHit> once = search.search("gift for a friend", 0, 10).results().content();
        assertThat(search.search("gift for a friend", 0, 10).results().content()).isEqualTo(once);
    }

    @Test
    void aSearchIsPublishedWithItsQueryAndTheResultsShown() {
        SearchResponse res = search.search("  perfume  ", 0, 2);
        assertThat(events).singleElement().isInstanceOfSatisfying(InteractionEvent.class, e -> {
            assertThat(e.type()).isEqualTo(InteractionType.SEARCH);
            assertThat(e.detail()).isEqualTo("perfume");
            assertThat(e.productIds()).isEqualTo(ids(res));
        });
    }

    @Test
    void anEmptyOrOverlongQueryIsRejected() {
        assertThatThrownBy(() -> search.search("   ", 0, 10)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> search.search(null, 0, 10)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> search.search("x".repeat(201), 0, 10)).isInstanceOf(ApiException.class);
        assertThat(events).isEmpty();
    }

    @Test
    void keywordsLeaveOutFillerNumbersAndPossessives() {
        assertThat(SearchService.keywords("Rose bouquet for my wife's 30th birthday, under 2k!!"))
                .containsExactly("rose", "bouquet", "wife", "birthday");
    }
}
