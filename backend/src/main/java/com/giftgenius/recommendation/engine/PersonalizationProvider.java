package com.giftgenius.recommendation.engine;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.recommendation.model.GiftPreferences;

/**
 * Extension point for personalisation: extra points for a product from what we know about the shopper (for example
 * from the interaction events in the analytics package). Nothing implements it yet beyond {@link NoPersonalization}.
 */
public interface PersonalizationProvider {

    /** Extra points for this product, for these preferences. 0 when there's nothing to go on. */
    double boost(GiftPreferences prefs, ProductDto product);
}
