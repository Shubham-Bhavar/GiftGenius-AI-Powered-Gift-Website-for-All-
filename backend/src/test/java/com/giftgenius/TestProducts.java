package com.giftgenius;

import java.math.BigDecimal;
import java.util.List;

import com.giftgenius.catalog.ProductDtos.ProductDto;

public final class TestProducts {

    private TestProducts() {
    }

    public static ProductDto product(long id, String name, String category, int price, double rating,
            List<String> occasions, List<String> relationships, List<String> personalities) {
        return new ProductDto(id, "p-" + id, name, category, BigDecimal.valueOf(price), BigDecimal.valueOf(price + 200),
                BigDecimal.valueOf(rating), 10, "★★★★★", "https://img/" + id, name, null, List.of(),
                occasions, List.of(), personalities, relationships, name + " description", null, false, false,
                20, true, true);
    }

    public static List<ProductDto> catalog() {
        return List.of(
                product(1, "Luxury Hamper Box", "gift sets", 499, 4.9, List.of("birthday", "anniversary"),
                        List.of("partner", "parent"), List.of("expressive")),
                product(4, "Signature Perfume", "fragrance", 1199, 4.8, List.of("anniversary", "valentine"),
                        List.of("partner"), List.of("expressive")),
                product(6, "Artisan Chocolate Box", "food & sweets", 299, 4.7, List.of("birthday", "festival"),
                        List.of("friend", "colleague"), List.of("extrovert")),
                product(11, "Wireless Earbuds Premium", "accessories", 1999, 4.6, List.of("birthday", "graduation"),
                        List.of("sibling", "friend"), List.of("practical")),
                product(12, "Handmade Warli Art Frame", "cultural", 649, 4.8, List.of("festival"),
                        List.of("parent"), List.of("creative")));
    }
}
