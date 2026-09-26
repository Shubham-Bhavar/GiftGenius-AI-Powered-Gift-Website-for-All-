package com.giftgenius.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.giftgenius.catalog.Product;
import com.giftgenius.catalog.ProductRepository;
import com.giftgenius.common.ApiException;
import com.giftgenius.TestProps;
import com.giftgenius.order.OrderRepository;
import com.giftgenius.order.OrderStatus;
import com.giftgenius.pricing.PricingDtos.CouponStatus;
import com.giftgenius.pricing.PricingDtos.Quote;
import com.giftgenius.pricing.PricingDtos.QuoteLineRequest;

class PricingServiceTest {

    private final ProductRepository products = mock(ProductRepository.class);
    private final CouponRepository coupons = mock(CouponRepository.class);
    private final OrderRepository orders = mock(OrderRepository.class);
    private PricingService pricing;

    @BeforeEach
    void setUp() {
        pricing = new PricingService(products, coupons, orders, TestProps.defaults());

        Product hamper = new Product();
        hamper.setId(1L);
        hamper.setName("Luxury Hamper Box");
        hamper.setPrice(new BigDecimal("499.00"));
        hamper.setImageUrl("x");
        hamper.setStock(5);
        hamper.setActive(true);
        when(products.findAllById(anyList())).thenReturn(List.of(hamper));
        when(coupons.findByCodeIgnoreCase(anyString())).thenReturn(Optional.empty());
    }

    @Test
    void chargesStandardDeliveryBelowThresholdAndFreeAbove() {
        Quote one = pricing.quote(List.of(new QuoteLineRequest(1L, 1)), null, DeliveryType.STANDARD, true);
        assertThat(one.deliveryFee()).isEqualByComparingTo("49");
        assertThat(one.total()).isEqualByComparingTo("548");

        Quote three = pricing.quote(List.of(new QuoteLineRequest(1L, 3)), null, DeliveryType.STANDARD, true);
        assertThat(three.subtotal()).isEqualByComparingTo("1497");
        assertThat(three.deliveryFee()).isEqualByComparingTo("0");
    }

    @Test
    void percentCouponRespectsCap() {
        Coupon c = new Coupon();
        c.setCode("GIFT20");
        c.setType(CouponType.PERCENT);
        c.setDiscountValue(new BigDecimal("20"));
        c.setMaxDiscount(new BigDecimal("250"));
        when(coupons.findByCodeIgnoreCase("GIFT20")).thenReturn(Optional.of(c));

        Quote q = pricing.quote(List.of(new QuoteLineRequest(1L, 3)), "gift20", DeliveryType.EXPRESS, true);
        assertThat(q.couponStatus()).isEqualTo(CouponStatus.APPLIED);
        assertThat(q.discount()).isEqualByComparingTo("250"); // 20% of 1497 = 299, capped
        assertThat(q.total()).isEqualByComparingTo("1346");  // 1497 - 250 + 99
    }

    @Test
    void invalidCouponIsAWarningInPreviewButAnErrorAtCheckout() {
        Quote preview = pricing.quote(List.of(new QuoteLineRequest(1L, 1)), "NOPE", null, false);
        assertThat(preview.couponStatus()).isEqualTo(CouponStatus.INVALID);
        assertThatThrownBy(() -> pricing.quote(List.of(new QuoteLineRequest(1L, 1)), "NOPE", null, true))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void insufficientStockBlocksCheckout() {
        assertThatThrownBy(() -> pricing.quote(List.of(new QuoteLineRequest(1L, 6)), null, null, true))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Only 5 left");
    }

    @Test
    void perCustomerCouponLimitIsEnforcedForSignedInShoppers() {
        Coupon c = new Coupon();
        c.setCode("WELCOME");
        c.setType(CouponType.FLAT);
        c.setDiscountValue(new BigDecimal("100"));
        c.setPerUserLimit(1);
        when(coupons.findByCodeIgnoreCase("WELCOME")).thenReturn(Optional.of(c));
        when(orders.countByUserIdAndCouponCodeAndStatusNot(7L, "WELCOME", OrderStatus.CANCELLED)).thenReturn(1L);
        when(orders.countByUserIdAndCouponCodeAndStatusNot(8L, "WELCOME", OrderStatus.CANCELLED)).thenReturn(0L);

        Quote used = pricing.quote(List.of(new QuoteLineRequest(1L, 1)), "welcome", null, false, 7L);
        assertThat(used.couponStatus()).isEqualTo(CouponStatus.INVALID);
        assertThat(used.couponMessage()).contains("already used");
        assertThatThrownBy(() -> pricing.quote(List.of(new QuoteLineRequest(1L, 1)), "welcome", null, true, 7L))
                .isInstanceOf(ApiException.class);

        Quote fresh = pricing.quote(List.of(new QuoteLineRequest(1L, 1)), "welcome", null, true, 8L);
        assertThat(fresh.couponStatus()).isEqualTo(CouponStatus.APPLIED);
        assertThat(fresh.discount()).isEqualByComparingTo("100");
    }

    @Test
    void flatCouponNeverDiscountsBelowZero() {
        Coupon c = new Coupon();
        c.setCode("BIG");
        c.setType(CouponType.FLAT);
        c.setDiscountValue(new BigDecimal("5000"));
        assertThat(PricingService.discountFor(c, new BigDecimal("499"))).isEqualByComparingTo("499");
    }
}
