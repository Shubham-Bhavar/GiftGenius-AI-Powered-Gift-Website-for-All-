package com.giftgenius.recommendation.model;

import java.util.List;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;

/** A candidate with its total score and the matches that make it up, in the order they were found. */
public record ScoredProduct(ProductDto product, double score, List<Match> matches) {

    public ScoredProduct {
        matches = List.copyOf(matches);
    }

    /** Whether anything about it fits what the shopper asked for (rather than just being a good product). */
    public boolean fits() {
        return matches.stream().anyMatch(m -> m.signal().kind() == Signal.Kind.FIT && m.points() > 0);
    }

    /** Its points for quality alone: rating, reviews and recent sales. */
    public double quality() {
        return matches.stream().filter(m -> m.signal().kind() == Signal.Kind.QUALITY).mapToDouble(Match::points).sum();
    }

    public boolean has(Signal signal) {
        return matches.stream().anyMatch(m -> m.signal() == signal);
    }
}
