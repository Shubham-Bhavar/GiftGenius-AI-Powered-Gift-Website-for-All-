package com.giftgenius.recommendation.engine;

import java.util.Locale;
import java.util.Set;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;

/**
 * The budget planner's three kinds of gift, so a shopper weighs three different ideas within one budget. A product's
 * kind comes from its catalogue category; categories not listed here aren't offered by the planner.
 */
public enum PlanKind {
    /** Something they'll use every day. */
    PRACTICAL(Set.of("accessories", "home decor")),
    /** Something that keeps a memory or a feeling. */
    EMOTIONAL(Set.of("personalized", "flowers", "cultural")),
    /** Something to enjoy or unwind with: self-care, treats, hampers, a fragrance. */
    EXPERIENCE(Set.of("wellness", "food & sweets", "gift sets", "fragrance"));

    private final Set<String> categories;

    PlanKind(Set<String> categories) {
        this.categories = categories;
    }

    public boolean includes(ProductDto p) {
        return categories.contains(p.category());
    }

    /** As the API names it: "practical", "emotional", "experience". */
    public String key() {
        return name().toLowerCase(Locale.ROOT);
    }
}
