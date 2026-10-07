package com.giftgenius.recommendation;

import java.math.BigDecimal;
import java.util.List;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.catalog.dto.ProductDtos.SellerRef;
import com.giftgenius.catalog.model.ProductStatus;

/** A catalogue product for engine tests: everything neutral unless set. */
public final class ProductFixture {

    private final long id;
    private String category = "gift sets";
    private int price = 999;
    private double rating = 4.5;
    private int reviewCount = 10;
    private List<String> tags = List.of();
    private List<String> occasions = List.of();
    private List<String> forWhom = List.of();
    private List<String> personalities = List.of();
    private List<String> relationships = List.of();
    private boolean cultural;
    private boolean festival;
    private boolean inStock = true;
    private String seller;

    private ProductFixture(long id) {
        this.id = id;
    }

    public static ProductFixture product(long id) {
        return new ProductFixture(id);
    }

    public ProductFixture category(String category) {
        this.category = category;
        return this;
    }

    public ProductFixture price(int price) {
        this.price = price;
        return this;
    }

    public ProductFixture rating(double rating, int reviewCount) {
        this.rating = rating;
        this.reviewCount = reviewCount;
        return this;
    }

    public ProductFixture tags(String... tags) {
        this.tags = List.of(tags);
        return this;
    }

    public ProductFixture occasions(String... occasions) {
        this.occasions = List.of(occasions);
        return this;
    }

    public ProductFixture forWhom(String... forWhom) {
        this.forWhom = List.of(forWhom);
        return this;
    }

    public ProductFixture personalities(String... personalities) {
        this.personalities = List.of(personalities);
        return this;
    }

    public ProductFixture relationships(String... relationships) {
        this.relationships = List.of(relationships);
        return this;
    }

    public ProductFixture cultural() {
        this.cultural = true;
        return this;
    }

    public ProductFixture festival() {
        this.festival = true;
        return this;
    }

    public ProductFixture outOfStock() {
        this.inStock = false;
        return this;
    }

    /** Sold by this marketplace seller (by slug); unset means a GiftGenius product. */
    public ProductFixture seller(String slug) {
        this.seller = slug;
        return this;
    }

    public ProductDto build() {
        String name = "Product " + id;
        return new ProductDto(id, "p-" + id, name, category, BigDecimal.valueOf(price), BigDecimal.valueOf(price + 200),
                BigDecimal.valueOf(rating), reviewCount, "★★★★★", "https://img/" + id, name, null, tags, occasions,
                forWhom, personalities, relationships, name + " description", null, cultural, festival,
                inStock ? 20 : 0, inStock, true, seller == null ? null : new SellerRef(seller, seller + " store"),
                ProductStatus.APPROVED, null, null);
    }
}
