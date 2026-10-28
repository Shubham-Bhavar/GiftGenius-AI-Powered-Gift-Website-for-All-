package com.giftgenius.catalog.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Sort;

/** Shop sorts end on the product id, so products that tie never repeat or go missing between pages. */
class ProductSortTest {

    @Test
    void everySortEndsOnTheId() {
        for (String sort : new String[] { null, "featured", "newest", "rating", "price_asc", "price-desc", "unknown" }) {
            Sort.Order last = ProductService.sortFor(sort).stream().reduce((a, b) -> b).orElseThrow();
            assertThat(last.getProperty()).as("sort=" + sort).isEqualTo("id");
        }
    }

    @Test
    void keepsTheShoppersChoiceFirst() {
        assertThat(ProductService.sortFor("price_asc")).containsExactly(Sort.Order.asc("price"), Sort.Order.asc("id"));
        assertThat(ProductService.sortFor("newest")).containsExactly(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
        assertThat(ProductService.sortFor("rating")).containsExactly(Sort.Order.desc("rating"),
                Sort.Order.desc("reviewCount"), Sort.Order.asc("id"));
    }
}
