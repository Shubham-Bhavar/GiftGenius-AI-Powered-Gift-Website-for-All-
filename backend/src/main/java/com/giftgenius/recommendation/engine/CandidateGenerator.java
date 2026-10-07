package com.giftgenius.recommendation.engine;

import java.util.List;

import org.springframework.stereotype.Component;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.catalog.service.ProductService;
import com.giftgenius.recommendation.model.GiftPreferences;

/** Where recommendations come from: only real, purchasable products, and never far over the budget. */
@Component
public class CandidateGenerator {

    private final ProductService products;
    private final RecommendationWeights weights;

    public CandidateGenerator(ProductService products, RecommendationWeights weights) {
        this.products = products;
        this.weights = weights;
    }

    /** Everything that can be bought right now: listed and in stock (cached by the catalogue). */
    public List<ProductDto> catalog() {
        return products.purchasableCatalog();
    }

    /** Hard filter: nothing priced above the budget tolerance. With a flexible budget, everything. */
    public List<ProductDto> candidates(List<ProductDto> catalog, GiftPreferences prefs) {
        if (!prefs.hasBudget()) {
            return catalog;
        }
        double ceiling = prefs.budget() * weights.budgetTolerance();
        return catalog.stream().filter(p -> p.price().doubleValue() <= ceiling).toList();
    }
}
