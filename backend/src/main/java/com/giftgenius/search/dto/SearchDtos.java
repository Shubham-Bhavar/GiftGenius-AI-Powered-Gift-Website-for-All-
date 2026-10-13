package com.giftgenius.search.dto;

import java.util.List;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.common.PageResponse;

public final class SearchDtos {

    private SearchDtos() {
    }

    /**
     * What the search read from the query: preferences in the catalogue's terms (null or empty when not mentioned)
     * and the keywords it matched products against.
     */
    public record Interpreted(String recipient, String occasion, Integer budget, List<String> interests,
            String personality, List<String> keywords) {
    }

    /** A result and its relevance: higher is better, comparable only within one search. */
    public record SearchHit(ProductDto product, double score) {
    }

    public record SearchResponse(String query, Interpreted interpreted, PageResponse<SearchHit> results) {
    }
}
