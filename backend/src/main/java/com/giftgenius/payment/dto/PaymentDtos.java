package com.giftgenius.payment.dto;

import jakarta.validation.constraints.NotBlank;

public final class PaymentDtos {

    private PaymentDtos() {
    }

    /** What Razorpay Checkout hands the browser after a successful payment. */
    public record VerifyPaymentRequest(
            @NotBlank String razorpayOrderId,
            @NotBlank String razorpayPaymentId,
            @NotBlank String razorpaySignature) {
    }
}
