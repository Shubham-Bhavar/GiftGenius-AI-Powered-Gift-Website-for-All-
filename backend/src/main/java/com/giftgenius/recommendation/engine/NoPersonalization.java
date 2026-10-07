package com.giftgenius.recommendation.engine;

import org.springframework.stereotype.Component;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.recommendation.model.GiftPreferences;

/**
 * Today's personalisation: none, so recommendations depend only on the preferences and the catalogue. A real
 * {@link PersonalizationProvider} replaces this bean.
 */
@Component
public class NoPersonalization implements PersonalizationProvider {

    @Override
    public double boost(GiftPreferences prefs, ProductDto product) {
        return 0;
    }
}
