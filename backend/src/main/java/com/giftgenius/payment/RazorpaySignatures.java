package com.giftgenius.payment;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** HMAC-SHA256 checks exactly as Razorpay documents them, with constant-time comparison. */
public final class RazorpaySignatures {

    private RazorpaySignatures() {
    }

    /** Checkout callback: signature = HMAC(order_id + "|" + payment_id, key_secret). */
    public static boolean verifyPayment(String razorpayOrderId, String razorpayPaymentId, String signature,
            String keySecret) {
        return hasText(keySecret) && matches(hmacHex(razorpayOrderId + "|" + razorpayPaymentId, keySecret), signature);
    }

    /** Webhook: X-Razorpay-Signature = HMAC(raw request body, webhook_secret). */
    public static boolean verifyWebhook(String rawBody, String signature, String webhookSecret) {
        return hasText(webhookSecret) && matches(hmacHex(rawBody, webhookSecret), signature);
    }

    static String hmacHex(String data, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("HMAC unavailable", e);
        }
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    private static boolean matches(String expected, String actual) {
        if (actual == null) {
            return false;
        }
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                actual.trim().toLowerCase().getBytes(StandardCharsets.UTF_8));
    }
}
