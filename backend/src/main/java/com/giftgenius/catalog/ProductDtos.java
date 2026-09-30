package com.giftgenius.catalog;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.giftgenius.common.SafeText;
import com.giftgenius.seller.SellerProfile;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class ProductDtos {

    private ProductDtos() {
    }

    public record Badge(String text, String className) {
    }

    /** Public face of the store selling a product; absent for GiftGenius's own products. */
    public record SellerRef(String slug, String storeName) {
        public static SellerRef from(SellerProfile s) {
            return s == null ? null : new SellerRef(s.getSlug(), s.getStoreName());
        }
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
            boolean active,
            SellerRef seller,
            ProductStatus status,
            /* Only ever set on a rejected product, which only its seller and admins can see. */
            String rejectionReason,
            Instant createdAt) {

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
                    p.getStock(), p.isPurchasable(), p.isActive(), SellerRef.from(p.getSeller()), p.getStatus(),
                    p.getStatus() == ProductStatus.REJECTED ? p.getRejectionReason() : null, p.getCreatedAt());
        }
    }

    public record CategoryDto(String category, long count) {
    }

    /**
     * A product as a seller submits it. There is deliberately no seller, status, rating, badge or listing field:
     * the owner is the signed-in seller, and status and listing are decided by review.
     * {@code submit}: send it for review now (otherwise it is saved as a draft).
     */
    public record SellerProductRequest(
            @NotBlank(message = "Enter the product name") @Size(min = 3, max = 150, message = "Use 3 to 150 characters")
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String name,
            @NotBlank(message = "Enter a short description")
            @Size(min = 10, max = 500, message = "Use 10 to 500 characters")
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String description,
            @Size(max = 5000, message = "Use at most 5000 characters")
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String longDescription,
            @NotBlank(message = "Choose a category") @Size(max = 40) String category,
            @Size(max = 7, message = "Choose at most 7 occasions") Set<@Size(max = 40) String> occasion,
            @Size(max = 10, message = "Use at most 10 tags")
            Set<@Size(max = 30, message = "Keep each tag under 30 characters")
                @Pattern(regexp = "^[A-Za-z0-9 &-]*$", message = "Tags can use letters, numbers, spaces, & and -")
                String> tags,
            @NotNull(message = "Enter the price") @DecimalMin(value = "1.00", message = "The price must be at least ₹1")
            @DecimalMax(value = "1000000.00", message = "The price must be at most ₹10,00,000")
            @Digits(integer = 7, fraction = 2, message = "Use at most 2 decimal places") BigDecimal price,
            @DecimalMin(value = "1.00", message = "The compare-at price must be at least ₹1")
            @DecimalMax(value = "1000000.00", message = "The compare-at price must be at most ₹10,00,000")
            @Digits(integer = 7, fraction = 2, message = "Use at most 2 decimal places") BigDecimal compareAtPrice,
            @NotNull(message = "Enter the stock") @Min(value = 0, message = "Stock can't be negative")
            @Max(value = 100_000, message = "Stock can be at most 100000") Integer stock,
            @NotBlank(message = "Add an image link") @Size(max = 1000)
            @Pattern(regexp = SafeText.HTTPS_URL, message = SafeText.HTTPS_URL_MESSAGE) String image,
            @Size(max = 255) @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String alt,
            boolean submit) {
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
