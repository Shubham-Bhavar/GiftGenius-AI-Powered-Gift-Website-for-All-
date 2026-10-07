package com.giftgenius.recommendation.model;

import java.util.List;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;

/** A candidate with its total score and the matches that make it up, in the order they were found. */
public record ScoredProduct(ProductDto product, double score, List<Match> matches) {

    public ScoredProduct {
        matches = List.copyOf(matches);
    }
}
