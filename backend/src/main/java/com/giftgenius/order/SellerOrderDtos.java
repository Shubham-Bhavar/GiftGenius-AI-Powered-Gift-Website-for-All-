package com.giftgenius.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import com.giftgenius.common.SafeText;
import com.giftgenius.pricing.DeliveryType;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * A seller's view of an order: only their own lines, their share of the money, and what they need to deliver.
 * No other seller's lines, no order totals or coupons, and no customer email or account details.
 */
public final class SellerOrderDtos {

    private SellerOrderDtos() {
    }

    public record FulfillmentUpdateRequest(
            @NotNull(message = "Choose a status") FulfillmentStatus status,
            @Size(max = 255, message = "Use at most 255 characters")
            @Pattern(regexp = SafeText.NO_MARKUP, message = SafeText.NO_MARKUP_MESSAGE) String note) {
    }

    /** sellerTotal is the seller's lines at the prices paid, before any order-wide coupon. */
    public record SellerOrderSummary(String orderNumber, OrderStatus orderStatus, FulfillmentStatus fulfillmentStatus,
            int itemCount, int lineCount, BigDecimal sellerTotal, String firstItemName, String firstItemImage,
            String shipCity, Instant createdAt) {
    }

    public record SellerOrderItem(Long productId, String name, String image, BigDecimal unitPrice, int quantity,
            BigDecimal lineTotal, String customName, String customMessage, FulfillmentStatus fulfillmentStatus,
            String fulfillmentNote, Instant fulfillmentUpdatedAt) {
    }

    /** Where to deliver: the recipient's name, phone and address, which the seller needs to ship. */
    public record SellerShipping(String fullName, String phone, String addressLine, String city, String state,
            String pincode) {
    }

    public record SellerOrderDto(String orderNumber, OrderStatus orderStatus, PaymentMethod paymentMethod,
            DeliveryType deliveryType, FulfillmentStatus fulfillmentStatus, List<FulfillmentStatus> nextSteps,
            BigDecimal sellerTotal, SellerShipping shipping, List<SellerOrderItem> items, Instant createdAt) {
    }
}
