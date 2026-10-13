package com.giftgenius.recommendation.engine;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

class RecommendationWeightsTest {

    @Test
    void theTunedDefaults() {
        RecommendationWeights w = RecommendationWeights.defaults();
        assertThat(w.fit().occasion()).isEqualTo(30);
        assertThat(w.fit().recipient()).isEqualTo(20);
        assertThat(w.budget().within()).isEqualTo(25);
        assertThat(w.budget().over()).isEqualTo(-20);
        assertThat(w.budget().tolerance()).isEqualTo(1.15);
        assertThat(w.quality().priorRating()).isEqualTo(4.3);
        assertThat(w.quality().popularityWindowDays()).isEqualTo(90);
        assertThat(w.variety().categoryRepeat()).isEqualTo(12);
        assertThat(w.variety().sellerRepeat()).isEqualTo(8);
    }

    @Test
    void anyWeightCanBeConfiguredWithoutLosingTheOtherDefaults() {
        RecommendationWeights w = new Binder(new MapConfigurationPropertySource(Map.of(
                "app.recommendation.fit.occasion", "45",
                "app.recommendation.variety.category-repeat", "20")))
                .bindOrCreate("app.recommendation", RecommendationWeights.class);
        assertThat(w.fit().occasion()).isEqualTo(45);
        assertThat(w.variety().categoryRepeat()).isEqualTo(20);
        assertThat(w.fit().recipient()).isEqualTo(20);
        assertThat(w.budget().tolerance()).isEqualTo(1.15);
    }
}
