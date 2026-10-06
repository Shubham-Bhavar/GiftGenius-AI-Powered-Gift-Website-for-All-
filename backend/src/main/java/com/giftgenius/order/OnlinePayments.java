package com.giftgenius.order;

import java.math.BigDecimal;

import com.giftgenius.order.OrderDtos.PaymentInstructions;

/**
 * What checkout needs from the online-payment provider. The payment package implements it (RazorpayPayments),
 * so orders never depend on a particular gateway.
 */
public interface OnlinePayments {

    /** Whether shoppers can pay online right now. */
    boolean available();

    /**
     * Opens a payment for an order's total and returns the provider's id for it. Throws ApiException (503)
     * when the provider can't be reached.
     */
    String open(BigDecimal total, String orderNumber);

    /** What the browser needs to open the payment window, or null when nothing is due online. */
    PaymentInstructions instructionsFor(Order order);
}
