package com.giftgenius.recommendation.engine;

import java.util.List;

import org.springframework.stereotype.Component;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.catalog.service.ProductService;
import com.giftgenius.recommendation.model.GiftPreferences;

/**
 * Where recommendations come from: only real products that can be bought right now (listed, approved and in stock),
 * never far over the budget, and never something the shopper said the recipient doesn't like. Nothing else can ever
 * be recommended.
 */
@Component
public class CandidateGenerator {

    private final ProductService products;
    private final RecommendationWeights weights;

    public CandidateGenerator(ProductService products, RecommendationWeights weights) {
        this.products = products;
        this.weights = weights;
    }

    /** Everything that can be bought right now (cached by the catalogue). */
    public List<ProductDto> catalog() {
        return products.purchasableCatalog();
    }

    /** Hard filters: in stock, and nothing priced above the budget tolerance. With a flexible budget, all of it. */
    public List<ProductDto> candidates(List<ProductDto> catalog, GiftPreferences prefs) {
        double ceiling = prefs.hasBudget() ? prefs.budget() * weights.budget().tolerance() : Double.MAX_VALUE;
        return catalog.stream().filter(p -> p.inStock() && p.price().doubleValue() <= ceiling).toList();
    }

    /** In stock and priced at or under the budget, with no tolerance (the budget planner). */
    public List<ProductDto> strictlyWithinBudget(List<ProductDto> catalog, int budget) {
        return catalog.stream().filter(p -> p.inStock() && p.price().doubleValue() <= budget).toList();
    }

    /** Leaves out what they don't like or already have (see {@link AvoidList}). */
    public List<ProductDto> withoutAvoided(List<ProductDto> products, GiftPreferences prefs) {
        return prefs.avoid().isEmpty() ? products
                : products.stream().filter(p -> !AvoidList.excludes(prefs.avoid(), p)).toList();
    }
}
