package com.giftgenius.search.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.search.dto.SearchDtos.SearchResponse;
import com.giftgenius.search.service.SearchService;

/** Gift-aware product search. The catalogue listing (/api/products) is separate and unchanged. */
@RestController
@RequestMapping("/api/search")
public class SearchController {

    private final SearchService search;

    public SearchController(SearchService search) {
        this.search = search;
    }

    @GetMapping
    public SearchResponse search(@RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "24") int size) {
        return search.search(q, page, size);
    }
}
