package com.giftgenius.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.giftgenius.catalog.Product;
import com.giftgenius.catalog.ProductRepository;
import com.giftgenius.common.ApiException;
import com.giftgenius.config.AppProperties;
import com.giftgenius.order.OrderRepository;
import com.giftgenius.order.OrderStatus;
import com.giftgenius.pricing.PricingDtos.CouponStatus;
import com.giftgenius.pricing.PricingDtos.Quote;
import com.giftgenius.pricing.PricingDtos.QuoteLine;
import com.giftgenius.pricing.PricingDtos.QuoteLineRequest;

/**
 * The single place prices, discounts and delivery fees are calculated.
 * The browser never sends prices; it sends product ids and quantities.
 */
@Service
public class PricingService {

    private final ProductRepository products;
    private final CouponRepository coupons;
    private final OrderRepository orders;
    private final AppProperties.Shipping shipping;

    public PricingService(ProductRepository products, CouponRepository coupons, OrderRepository orders,
            AppProperties properties) {
        this.products = products;
        this.coupons = coupons;
        this.orders = orders;
        this.shipping = properties.shipping();
    }

    public Quote quote(List<QuoteLineRequest> requested, String couponCode, DeliveryType deliveryType, boolean strict) {
        return quote(requested, couponCode, deliveryType, strict, null);
    }

    /**
     * @param strict when true (order placement) unavailable items and invalid coupons throw;
     *               when false (cart preview) they come back as warnings so the UI can explain.
     * @param userId the signed-in customer, used for per-customer coupon limits; null for guests
     */
    @Transactional(readOnly = true)
    public Quote quote(List<QuoteLineRequest> requested, String couponCode, DeliveryType deliveryType, boolean strict,
            Long userId) {
        if (requested == null || requested.isEmpty()) {
            throw ApiException.badRequest("Your cart is empty.");
        }
        DeliveryType delivery = deliveryType == null ? DeliveryType.STANDARD : deliveryType;

        Map<Long, Product> byId = products.findAllById(
                requested.stream().map(QuoteLineRequest::productId).distinct().toList())
                .stream().collect(Collectors.toMap(Product::getId, Function.identity()));

        List<QuoteLine> lines = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;

        for (QuoteLineRequest r : requested) {
            Product p = byId.get(r.productId());
            if (p == null || !p.isActive()) {
                fail(strict, warnings, "One of the gifts in your cart is no longer available.");
                continue;
            }
            if (p.getStock() < r.quantity()) {
                String msg = p.getStock() == 0
                        ? p.getName() + " is out of stock."
                        : "Only " + p.getStock() + " left of " + p.getName() + ".";
                fail(strict, warnings, msg);
                if (p.getStock() == 0) {
                    continue;
                }
            }
            int qty = Math.min(r.quantity(), Math.max(p.getStock(), 0));
            BigDecimal lineTotal = p.getPrice().multiply(BigDecimal.valueOf(qty));
            lines.add(new QuoteLine(p.getId(), p.getName(), p.getImageUrl(), p.getPrice(), qty, lineTotal, p.getStock()));
            subtotal = subtotal.add(lineTotal);
        }

        BigDecimal discount = BigDecimal.ZERO;
        CouponStatus couponStatus = CouponStatus.NONE;
        String couponMessage = null;
        String appliedCode = null;

        if (StringUtils.hasText(couponCode)) {
            String code = couponCode.trim().toUpperCase();
            Coupon coupon = coupons.findByCodeIgnoreCase(code).orElse(null);
            if (coupon == null || !coupon.isCurrentlyValid(Instant.now())) {
                couponStatus = CouponStatus.INVALID;
                couponMessage = "That code isn't valid.";
            } else if (userId != null && coupon.getPerUserLimit() != null
                    && orders.countByUserIdAndCouponCodeAndStatusNot(userId, coupon.getCode(), OrderStatus.CANCELLED)
                            >= coupon.getPerUserLimit()) {
                couponStatus = CouponStatus.INVALID;
                couponMessage = "You've already used " + coupon.getCode() + ".";
            } else if (subtotal.compareTo(coupon.getMinOrderAmount()) < 0) {
                couponStatus = CouponStatus.INVALID;
                couponMessage = "Add ₹" + coupon.getMinOrderAmount().subtract(subtotal).setScale(0, RoundingMode.UP)
                        + " more to use " + code + ".";
            } else {
                discount = discountFor(coupon, subtotal);
                couponStatus = CouponStatus.APPLIED;
                appliedCode = coupon.getCode();
                couponMessage = describe(coupon, discount);
            }
            if (strict && couponStatus == CouponStatus.INVALID) {
                throw ApiException.badRequest(couponMessage);
            }
        }

        BigDecimal afterDiscount = subtotal.subtract(discount).max(BigDecimal.ZERO);
        BigDecimal deliveryFee = deliveryFee(delivery, afterDiscount);
        BigDecimal total = afterDiscount.add(deliveryFee);

        return new Quote(lines, money(subtotal), money(discount), money(deliveryFee), money(total), delivery,
                appliedCode, couponStatus, couponMessage, shipping.freeShippingThreshold(), warnings);
    }

    BigDecimal deliveryFee(DeliveryType type, BigDecimal amount) {
        return switch (type) {
            case STANDARD -> amount.compareTo(shipping.freeShippingThreshold()) >= 0 ? BigDecimal.ZERO
                    : shipping.standardFee();
            case EXPRESS -> shipping.expressFee();
            case SAME_DAY -> shipping.sameDayFee();
        };
    }

    static BigDecimal discountFor(Coupon c, BigDecimal subtotal) {
        BigDecimal d = switch (c.getType()) {
            case PERCENT -> subtotal.multiply(c.getDiscountValue())
                    .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP);
            case FLAT -> c.getDiscountValue();
        };
        if (c.getMaxDiscount() != null) {
            d = d.min(c.getMaxDiscount());
        }
        return d.min(subtotal).max(BigDecimal.ZERO);
    }

    private static String describe(Coupon c, BigDecimal discount) {
        return c.getCode() + " applied: you save ₹" + discount.setScale(0, RoundingMode.HALF_UP) + ".";
    }

    private static void fail(boolean strict, List<String> warnings, String message) {
        if (strict) {
            throw ApiException.conflict(message);
        }
        warnings.add(message);
    }

    private static BigDecimal money(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP);
    }
}
