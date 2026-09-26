package com.giftgenius.payment;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RazorpaySignaturesTest {

    @Test
    void acceptsCorrectSignatureAndRejectsTampering() {
        String secret = "test_secret";
        String sig = RazorpaySignatures.hmacHex("order_123|pay_456", secret);
        assertThat(RazorpaySignatures.verifyPayment("order_123", "pay_456", sig, secret)).isTrue();
        assertThat(RazorpaySignatures.verifyPayment("order_123", "pay_999", sig, secret)).isFalse();
        assertThat(RazorpaySignatures.verifyPayment("order_123", "pay_456", null, secret)).isFalse();
    }

    @Test
    void webhookSignatureCoversRawBody() {
        String body = "{\"event\":\"payment.captured\"}";
        String sig = RazorpaySignatures.hmacHex(body, "whsec");
        assertThat(RazorpaySignatures.verifyWebhook(body, sig, "whsec")).isTrue();
        assertThat(RazorpaySignatures.verifyWebhook(body + " ", sig, "whsec")).isFalse();
    }
}
