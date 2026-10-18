package com.giftgenius.analytics;

/** What a shopper did. The name is the event's wire name, e.g. "cart_add". */
public enum InteractionType {
    PRODUCT_VIEW("product_view"),
    /** Client-side only today (a click in a list); reserved for a future client event endpoint. */
    PRODUCT_CLICK("product_click"),
    RECOMMENDATION_VIEW("recommendation_view"),
    /** Client-side only today; reserved like PRODUCT_CLICK. */
    RECOMMENDATION_CLICK("recommendation_click"),
    WISHLIST_ADD("wishlist_add"),
    CART_ADD("cart_add"),
    PURCHASE("purchase"),
    SEARCH("search");

    private final String wireName;

    InteractionType(String wireName) {
        this.wireName = wireName;
    }

    public String wireName() {
        return wireName;
    }
}
