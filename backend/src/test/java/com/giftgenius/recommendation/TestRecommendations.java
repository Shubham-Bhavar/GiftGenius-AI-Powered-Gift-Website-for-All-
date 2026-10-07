package com.giftgenius.recommendation;

import static org.mockito.Mockito.mock;

import com.giftgenius.catalog.service.ProductService;
import com.giftgenius.order.repository.OrderItemRepository;
import com.giftgenius.recommendation.engine.CandidateGenerator;
import com.giftgenius.recommendation.engine.DiversityService;
import com.giftgenius.recommendation.engine.ExplanationService;
import com.giftgenius.recommendation.engine.NoPersonalization;
import com.giftgenius.recommendation.engine.PopularitySignals;
import com.giftgenius.recommendation.engine.ProductScorer;
import com.giftgenius.recommendation.engine.RankingService;
import com.giftgenius.recommendation.engine.RecommendationWeights;
import com.giftgenius.recommendation.service.RecommendationService;

/** The real recommendation pipeline over a (mocked) catalogue, with the default weights. */
public final class TestRecommendations {

    private TestRecommendations() {
    }

    /** With no sales history (a mocked repository returns no rows). */
    public static RecommendationService service(ProductService products) {
        return service(products, mock(OrderItemRepository.class));
    }

    public static RecommendationService service(ProductService products, OrderItemRepository sales) {
        RecommendationWeights w = RecommendationWeights.defaults();
        return new RecommendationService(new CandidateGenerator(products, w), new ProductScorer(w), new RankingService(),
                new DiversityService(w), new ExplanationService(w), new PopularitySignals(sales, w),
                new NoPersonalization());
    }
}
