package com.giftgenius.recommendation.model;

import java.util.List;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;

/** A recommended product, its score, and why, in plain words (strongest reason first). */
public record Recommendation(ProductDto product, double score, List<String> reasons) {

    private static final String FALLBACK_REASON = "A thoughtful, highly rated choice";

    public Recommendation {
        reasons = List.copyOf(reasons);
    }

    /** The two strongest reasons, e.g. "Made for anniversaries · Comfortably within your budget". */
    public String summary() {
        return reasons.isEmpty() ? FALLBACK_REASON : String.join(" · ", reasons.subList(0, Math.min(2, reasons.size())));
    }
}
