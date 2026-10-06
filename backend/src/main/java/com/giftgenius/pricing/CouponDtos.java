package com.giftgenius.pricing;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** Coupons as Store Admin sees and edits them. */
public final class CouponDtos {

    private CouponDtos() {
    }

    public record CouponDto(Long id, String code, CouponType type, BigDecimal discountValue, BigDecimal minOrderAmount,
            BigDecimal maxDiscount, Integer usageLimit, int usedCount, Integer perUserLimit, Instant validFrom,
            Instant validUntil, boolean active) {

        static CouponDto from(Coupon c) {
            return new CouponDto(c.getId(), c.getCode(), c.getType(), c.getDiscountValue(), c.getMinOrderAmount(),
                    c.getMaxDiscount(), c.getUsageLimit(), c.getUsedCount(), c.getPerUserLimit(), c.getValidFrom(),
                    c.getValidUntil(), c.isActive());
        }
    }

    public record CouponRequest(
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9_-]{3,40}$", message = "Use 3–40 letters, digits, - or _") String code,
            @NotNull CouponType type,
            @NotNull @DecimalMin(value = "0.01") BigDecimal discountValue,
            @DecimalMin("0") BigDecimal minOrderAmount,
            @DecimalMin("0") BigDecimal maxDiscount,
            @Min(1) Integer usageLimit,
            @Min(1) Integer perUserLimit,
            Instant validFrom,
            Instant validUntil,
            Boolean active) {
    }
}
