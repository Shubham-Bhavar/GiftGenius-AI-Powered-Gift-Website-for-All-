package com.giftgenius.recommendation.engine;

import java.util.List;

import org.springframework.stereotype.Component;

import com.giftgenius.recommendation.model.ScoredProduct;

/** Picks the final set from the ranking. */
@Component
public class DiversityService {

    public List<ScoredProduct> select(List<ScoredProduct> ranked, int size) {
        return ranked.stream().limit(size).toList();
    }
}
