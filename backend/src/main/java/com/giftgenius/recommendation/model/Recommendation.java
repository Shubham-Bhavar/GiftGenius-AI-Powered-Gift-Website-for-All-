package com.giftgenius.recommendation.model;

import java.util.List;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;

/**
 * A recommended product, its score, and why.
 *
 * @param reasons the matching reasons as short clauses, strongest first (e.g. "made for birthdays")
 * @param summary one sentence for the shopper, e.g. "Made for birthdays, fits your ₹1,500 budget and personalised
 *                just for them."
 */
public record Recommendation(ProductDto product, double score, List<String> reasons, String summary) {

    public Recommendation {
        reasons = List.copyOf(reasons);
    }
}
