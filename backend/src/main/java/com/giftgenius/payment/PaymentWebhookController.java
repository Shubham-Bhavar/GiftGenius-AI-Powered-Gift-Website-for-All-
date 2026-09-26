package com.giftgenius.payment;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.order.OrderService;

/**
 * Razorpay → server confirmation. This is the source of truth when the customer closes the tab
 * after paying and the browser-side verify call never happens.
 */
@RestController
@RequestMapping("/api/payments/razorpay")
public class PaymentWebhookController {

    private final OrderService orders;

    public PaymentWebhookController(OrderService orders) {
        this.orders = orders;
    }

    @PostMapping("/webhook")
    public ResponseEntity<Void> webhook(@RequestBody String rawBody,
            @RequestHeader(name = "X-Razorpay-Signature", required = false) String signature) {
        orders.handleRazorpayWebhook(rawBody, signature);
        return ResponseEntity.ok().build();
    }
}
