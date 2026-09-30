package com.giftgenius.seller;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import com.giftgenius.catalog.ProductDtos.ProductDto;
import com.giftgenius.common.SafeText;
import com.giftgenius.order.SellerOrderDtos.SellerOrderSummary;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class SellerDtos {

    private SellerDtos() {
    }

    /** What a new seller tells us about their store, at sign-up or when an existing customer starts selling. */
    public record SellerApplication(
            @NotBlank(message = "Enter your store name") @Size(min = 2, max = 80, message = "Use 2 to 80 characters")
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String storeName,
            @Size(max = 1000, message = "Use at most 1000 characters")
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String description,
            @NotBlank(message = "Choose what you sell") @Size(max = 40) String businessCategory,
            @NotBlank(message = "Enter a phone number")
            @Pattern(regexp = "^[+0-9 ()-]{10,20}$", message = "Enter a valid phone number") String phone,
            @NotBlank(message = "Enter your business address") @Size(max = 300)
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String addressLine,
            @NotBlank(message = "Enter the city") @Size(max = 80)
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String city,
            @NotBlank(message = "Choose the state") @Size(max = 80)
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String state,
            @NotBlank(message = "Enter the PIN code")
            @Pattern(regexp = "^[1-9][0-9]{5}$", message = "Enter a 6-digit PIN code") String pincode) {
    }

    /** Store settings the seller can change. Status, ownership and the store's web address are not among them. */
    public record StoreSettingsRequest(
            @NotBlank(message = "Enter your store name") @Size(min = 2, max = 80, message = "Use 2 to 80 characters")
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String storeName,
            @Size(max = 1000, message = "Use at most 1000 characters")
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String description,
            @NotBlank(message = "Choose what you sell") @Size(max = 40) String businessCategory,
            @NotBlank(message = "Enter a phone number")
            @Pattern(regexp = "^[+0-9 ()-]{10,20}$", message = "Enter a valid phone number") String phone,
            @Email(message = "Enter a valid email") @Size(max = 255) String supportEmail,
            @NotBlank(message = "Enter your business address") @Size(max = 300)
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String addressLine,
            @NotBlank(message = "Enter the city") @Size(max = 80)
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String city,
            @NotBlank(message = "Choose the state") @Size(max = 80)
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String state,
            @NotBlank(message = "Enter the PIN code")
            @Pattern(regexp = "^[1-9][0-9]{5}$", message = "Enter a 6-digit PIN code") String pincode,
            @Size(max = 1000) @Pattern(regexp = SafeText.HTTPS_URL, message = SafeText.HTTPS_URL_MESSAGE) String logoUrl,
            @Size(max = 1000) @Pattern(regexp = SafeText.HTTPS_URL, message = SafeText.HTTPS_URL_MESSAGE) String bannerUrl) {
    }

    public record ReasonRequest(
            @NotBlank(message = "Give a reason the seller will see") @Size(max = 500, message = "Use at most 500 characters")
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String reason) {
    }

    /** The seller's own view of their store (admins see the same). */
    public record StoreDto(String slug, String storeName, String description, String businessCategory, String phone,
            String supportEmail, String addressLine, String city, String state, String pincode, String logoUrl,
            String bannerUrl, SellerStatus status, String statusReason, Instant createdAt, Instant reviewedAt) {

        public static StoreDto from(SellerProfile s) {
            boolean explained = s.getStatus() == SellerStatus.REJECTED || s.getStatus() == SellerStatus.SUSPENDED;
            return new StoreDto(s.getSlug(), s.getStoreName(), s.getDescription(), s.getBusinessCategory(), s.getPhone(),
                    s.getSupportEmail(), s.getAddressLine(), s.getCity(), s.getState(), s.getPincode(), s.getLogoUrl(),
                    s.getBannerUrl(), s.getStatus(), explained ? s.getStatusReason() : null, s.getCreatedAt(),
                    s.getReviewedAt());
        }
    }

    /** A storefront as shoppers see it: no address, phone or email. */
    public record PublicStoreDto(String slug, String storeName, String description, String businessCategory,
            String logoUrl, String bannerUrl, Instant memberSince, long productCount, List<String> categories) {
    }

    /**
     * Sales count orders that are confirmed (paid online, or cash on delivery) and not cancelled, at the prices
     * shoppers paid before any order-wide coupon. It is revenue, not profit: product costs aren't recorded.
     */
    public record SellerStats(long totalProducts, long listedProducts, long pendingProducts, long draftProducts,
            long rejectedProducts, long outOfStockProducts, long orders, long unitsSold, BigDecimal grossSales,
            BigDecimal averageOrderValue, long cancelledOrders, long ordersToFulfil) {
    }

    public record TopProduct(Long productId, String name, long unitsSold, BigDecimal sales) {
    }

    public record DashboardDto(StoreDto store, SellerStats stats, List<SellerOrderSummary> recentOrders,
            List<ProductDto> recentProducts) {
    }

    public record AnalyticsDto(SellerStats stats, List<TopProduct> topProducts) {
    }

    public record AdminSellerSummary(Long id, String storeName, String slug, String sellerName, String email,
            SellerStatus status, long productCount, long pendingProducts, long orderCount, BigDecimal revenue,
            Instant createdAt) {
    }

    public record AdminSellerDetail(Long id, String sellerName, String email, String accountPhone,
            boolean accountEnabled, StoreDto store, SellerStats stats, List<ProductDto> products,
            List<SellerOrderSummary> recentOrders) {
    }
}
