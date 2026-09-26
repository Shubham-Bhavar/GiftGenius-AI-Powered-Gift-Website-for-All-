package com.giftgenius.pricing;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.config.AppProperties;
import com.giftgenius.payment.RazorpayClient;
import com.giftgenius.pricing.PricingDtos.Quote;
import com.giftgenius.pricing.PricingDtos.QuoteRequest;
import com.giftgenius.security.AuthUser;

import jakarta.validation.Valid;

/** Public checkout endpoints: price preview and the options the checkout form should offer. */
@RestController
@RequestMapping("/api/checkout")
public class CheckoutController {

    private final PricingService pricing;
    private final AppProperties props;
    private final RazorpayClient razorpay;

    public CheckoutController(PricingService pricing, AppProperties props, RazorpayClient razorpay) {
        this.pricing = pricing;
        this.props = props;
        this.razorpay = razorpay;
    }

    public record DeliveryOption(DeliveryType type, String label, String eta, BigDecimal fee, BigDecimal freeAbove) {
    }

    public record CheckoutOptions(boolean onlinePaymentEnabled, boolean cashOnDeliveryEnabled,
            List<DeliveryOption> delivery) {
    }

    @GetMapping("/options")
    public CheckoutOptions options() {
        AppProperties.Shipping s = props.shipping();
        return new CheckoutOptions(razorpay.isEnabled(), true, List.of(
                new DeliveryOption(DeliveryType.STANDARD, "Standard", "3–5 days", s.standardFee(), s.freeShippingThreshold()),
                new DeliveryOption(DeliveryType.EXPRESS, "Express", "1–2 days", s.expressFee(), null),
                new DeliveryOption(DeliveryType.SAME_DAY, "Same day", "Order by 2 pm", s.sameDayFee(), null)));
    }

    @PostMapping("/quote")
    public Quote quote(@AuthenticationPrincipal AuthUser user, @Valid @RequestBody QuoteRequest req) {
        return pricing.quote(req.items(), req.couponCode(), req.deliveryType(), false,
                user == null ? null : user.id());
    }
}
