package com.giftgenius.pricing;

import java.math.BigDecimal;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class PricingDtos {

    private PricingDtos() {
    }

    public record QuoteLineRequest(@NotNull Long productId, @Min(1) @Max(10) int quantity) {
    }

    public record QuoteRequest(
            @NotEmpty(message = "Your cart is empty") @Size(max = 50) List<@Valid QuoteLineRequest> items,
            @Size(max = 40) String couponCode,
            DeliveryType deliveryType) {
    }

    public record QuoteLine(Long productId, String name, String image, BigDecimal unitPrice, int quantity,
            BigDecimal lineTotal, int available) {
    }

    public enum CouponStatus { NONE, APPLIED, INVALID }

    public record Quote(
            List<QuoteLine> lines,
            BigDecimal subtotal,
            BigDecimal discount,
            BigDecimal deliveryFee,
            BigDecimal total,
            DeliveryType deliveryType,
            String couponCode,
            CouponStatus couponStatus,
            String couponMessage,
            BigDecimal freeShippingThreshold,
            List<String> warnings) {
    }
}
