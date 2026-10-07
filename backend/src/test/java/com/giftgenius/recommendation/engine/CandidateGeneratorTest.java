package com.giftgenius.recommendation.engine;

import static com.giftgenius.recommendation.ProductFixture.product;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.catalog.service.ProductService;
import com.giftgenius.recommendation.model.GiftPreferences;

class CandidateGeneratorTest {

    private final ProductService products = mock(ProductService.class);
    private final CandidateGenerator generator = new CandidateGenerator(products, RecommendationWeights.defaults());

    private final List<ProductDto> catalog = List.of(
            product(1).price(999).build(),
            product(2).price(1150).build(),
            product(3).price(1151).build(),
            product(4).price(500).outOfStock().build());

    private static GiftPreferences budget(Integer budget) {
        return new GiftPreferences(null, null, budget, List.of(), null);
    }

    @Test
    void theCatalogueIsWhatCanBeBoughtRightNow() {
        when(products.purchasableCatalog()).thenReturn(catalog);
        assertThat(generator.catalog()).isEqualTo(catalog);
    }

    @Test
    void nothingAboveTheBudgetToleranceAndNothingOutOfStock() {
        // ₹1,000 × 1.15 tolerance = ₹1,150 ceiling, inclusive.
        assertThat(generator.candidates(catalog, budget(1000))).extracting(ProductDto::id).containsExactly(1L, 2L);
    }

    @Test
    void aFlexibleBudgetKeepsEverythingInStock() {
        assertThat(generator.candidates(catalog, budget(null))).extracting(ProductDto::id).containsExactly(1L, 2L, 3L);
        assertThat(generator.candidates(catalog, budget(0))).extracting(ProductDto::id).containsExactly(1L, 2L, 3L);
    }
}
