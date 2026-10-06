package com.giftgenius.order.service;

import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.giftgenius.cart.CartService;
import com.giftgenius.order.model.Order;
import com.giftgenius.order.model.OrderItem;
import com.giftgenius.order.model.OrderStatus;
import com.giftgenius.order.model.PaymentStatus;

/**
 * What an order does when its online payment succeeds, fails, or arrives after the order was cancelled.
 * The payment package decides that a payment is genuine; these are the order's side of it. Callers hold the
 * order row lock, inside their transaction.
 */
@Component
public class OrderPayments {

    private static final Logger log = LoggerFactory.getLogger(OrderPayments.class);

    private final CartService carts;
    private final OrderNotifier notifier;

    OrderPayments(CartService carts, OrderNotifier notifier) {
        this.carts = carts;
        this.notifier = notifier;
    }

    /** Paid in full: the order is confirmed, its products leave the cart, and everyone is told. */
    public void markPaid(Order o, String paymentId) {
        o.setPaymentStatus(PaymentStatus.PAID);
        o.setRazorpayPaymentId(paymentId);
        o.recordStatus(OrderStatus.CONFIRMED, "Payment received");
        carts.removeProducts(o.getUser().getId(),
                o.getItems().stream().map(OrderItem::getProductId).collect(Collectors.toSet()));
        notifier.customer(o, "Payment received: GiftGenius order " + o.getOrderNumber() + " is confirmed",
                "Thank you! We've received your payment and your order is confirmed.");
        notifier.sellers(o);
    }

    /** Money arrived for an order that was cancelled meanwhile: it must go back, whatever the amount. */
    public void recordLatePayment(Order o, String paymentId) {
        if (o.getPaymentStatus() == PaymentStatus.REFUND_PENDING || o.getPaymentStatus() == PaymentStatus.REFUNDED) {
            return;
        }
        o.setRazorpayPaymentId(paymentId);
        o.setPaymentStatus(PaymentStatus.REFUND_PENDING);
        log.warn("Late payment {} on cancelled order {}; refund required", paymentId, o.getOrderNumber());
    }

    /** A payment attempt failed; the order stays payable until the payment window closes. */
    public void markFailed(Order o) {
        if (o.getStatus() == OrderStatus.PENDING_PAYMENT) {
            o.setPaymentStatus(PaymentStatus.FAILED);
        }
    }
}
