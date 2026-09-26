package com.giftgenius.catalog;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class ProductDtos {

    private ProductDtos() {
    }

    public record Badge(String text, String className) {
    }

    /** Field names intentionally mirror the original products.js so the frontend renders it unchanged. */
    public record ProductDto(
            Long id,
            String slug,
            String name,
            String category,
            BigDecimal price,
            BigDecimal originalPrice,
            BigDecimal rating,
            int reviewCount,
            String starsDisplay,
            String image,
            String alt,
            Badge badge,
            List<String> tags,
            List<String> occasion,
            List<String> forWhom,
            List<String> personality,
            List<String> relationship,
            String description,
            String longDescription,
            @JsonProperty("isCultural") boolean isCultural,
            @JsonProperty("isFestival") boolean isFestival,
            int stock,
            boolean inStock,
            boolean active) {

        public static ProductDto from(Product p) {
            int full = p.getRating().add(new BigDecimal("0.25")).setScale(0, java.math.RoundingMode.FLOOR).intValue();
            full = Math.max(0, Math.min(5, full));
            String stars = "★".repeat(full) + "☆".repeat(5 - full);
            Badge badge = p.getBadgeText() == null ? null : new Badge(p.getBadgeText(), p.getBadgeClass());
            return new ProductDto(p.getId(), p.getSlug(), p.getName(), p.getCategory(), p.getPrice(),
                    p.getOriginalPrice(), p.getRating(), p.getReviewCount(), stars, p.getImageUrl(),
                    p.getAltText() != null ? p.getAltText() : p.getName(), badge,
                    List.copyOf(p.getTags()), List.copyOf(p.getOccasions()), List.copyOf(p.getForWhom()),
                    List.copyOf(p.getPersonalities()), List.copyOf(p.getRelationships()),
                    p.getDescription(), p.getLongDescription(), p.isCultural(), p.isFestival(),
                    p.getStock(), p.isPurchasable(), p.isActive());
        }
    }

    public record CategoryDto(String category, long count) {
    }

    public record ProductUpsertRequest(
            @NotBlank @Size(max = 150) String name,
            @NotBlank @Size(max = 40) String category,
            @NotBlank @Size(max = 500) String description,
            String longDescription,
            @NotNull @DecimalMin("0.00") BigDecimal price,
            @NotNull @DecimalMin("0.00") BigDecimal originalPrice,
            @DecimalMin("0.0") @DecimalMax("5.0") BigDecimal rating,
            @Min(0) Integer reviewCount,
            @NotBlank @Size(max = 1000) String image,
            @Size(max = 255) String alt,
            @Size(max = 40) String badgeText,
            @Size(max = 40) String badgeClass,
            @NotNull @Min(0) @Max(1_000_000) Integer stock,
            Boolean active,
            Boolean isCultural,
            Boolean isFestival,
            Set<String> tags,
            Set<String> occasion,
            Set<String> forWhom,
            Set<String> personality,
            Set<String> relationship) {
    }
}
