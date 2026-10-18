package com.giftgenius.payment.controller;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.order.dto.OrderDtos.OrderDto;
import com.giftgenius.payment.dto.PaymentDtos.VerifyPaymentRequest;
import com.giftgenius.security.AuthUser;
import com.giftgenius.payment.service.PaymentService;

import jakarta.validation.Valid;

/** The browser's "I paid" call after Razorpay Checkout. The webhook (PaymentWebhookController) is the backup. */
@RestController
public class PaymentController {

    private final PaymentService payments;

    public PaymentController(PaymentService payments) {
        this.payments = payments;
    }

    @PostMapping("/api/orders/{orderNumber}/payment/verify")
    public OrderDto verify(@AuthenticationPrincipal AuthUser user, @PathVariable String orderNumber,
            @Valid @RequestBody VerifyPaymentRequest req) {
        return payments.verifyPayment(user.id(), orderNumber, req);
    }
}
