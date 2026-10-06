package com.giftgenius.payment;

import java.math.BigDecimal;

import org.springframework.stereotype.Component;

import com.giftgenius.order.OnlinePayments;
import com.giftgenius.order.Order;
import com.giftgenius.order.OrderDtos.PaymentInstructions;
import com.giftgenius.order.OrderStatus;
import com.giftgenius.order.PaymentMethod;
import com.giftgenius.order.ShippingAddress;

/** Online payment through Razorpay: availability, opening a Razorpay order, and what the browser needs to pay. */
@Component
public class RazorpayPayments implements OnlinePayments {

    private final RazorpayClient razorpay;

    public RazorpayPayments(RazorpayClient razorpay) {
        this.razorpay = razorpay;
    }

    @Override
    public boolean available() {
        return razorpay.isEnabled();
    }

    @Override
    public String open(BigDecimal total, String orderNumber) {
        return razorpay.createOrder(total, orderNumber).id();
    }

    /** Only the public key id is shared with the browser, never the secret. */
    @Override
    public PaymentInstructions instructionsFor(Order o) {
        if (o.getPaymentMethod() != PaymentMethod.ONLINE || o.getStatus() != OrderStatus.PENDING_PAYMENT
                || o.getRazorpayOrderId() == null) {
            return null;
        }
        ShippingAddress s = o.getShipping();
        return new PaymentInstructions("RAZORPAY", razorpay.keyId(), o.getRazorpayOrderId(),
                Paise.of(o.getTotal()), "INR", s.getFullName(), s.getEmail(), s.getPhone());
    }
}
