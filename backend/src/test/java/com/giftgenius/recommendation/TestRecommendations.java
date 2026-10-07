package com.giftgenius.recommendation;

import com.giftgenius.catalog.service.ProductService;
import com.giftgenius.recommendation.engine.CandidateGenerator;
import com.giftgenius.recommendation.engine.DiversityService;
import com.giftgenius.recommendation.engine.ExplanationService;
import com.giftgenius.recommendation.engine.ProductScorer;
import com.giftgenius.recommendation.engine.RankingService;
import com.giftgenius.recommendation.engine.RecommendationWeights;
import com.giftgenius.recommendation.service.RecommendationService;

/** The real recommendation pipeline over a (mocked) catalogue, with the default weights. */
public final class TestRecommendations {

    private TestRecommendations() {
    }

    public static RecommendationService service(ProductService products) {
        RecommendationWeights w = RecommendationWeights.defaults();
        return new RecommendationService(new CandidateGenerator(products, w), new ProductScorer(w), new RankingService(),
                new DiversityService(), new ExplanationService());
    }
}
