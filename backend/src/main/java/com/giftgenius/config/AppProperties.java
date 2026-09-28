package com.giftgenius.config;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Typed view of everything under {@code app.*} in application.yml. */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String publicUrl,
        Security security,
        Ai ai,
        Payment payment,
        Shipping shipping,
        Admin admin,
        RateLimit rateLimit,
        Orders orders,
        Mail mail,
        Geo geo) {

    public record Security(
            String jwtSecret,
            Duration accessTokenTtl,
            Duration refreshTokenTtl,
            /* A refresh token rotated less than this long ago may be exchanged again (parallel tabs). */
            Duration refreshReuseGrace,
            Duration passwordResetTtl,
            boolean cookieSecure,
            String cookieSameSite,
            List<String> allowedOrigins) {
    }

    public record Ai(boolean enabled, String apiKey, String model, String baseUrl, Duration timeout) {
    }

    public record Payment(
            boolean razorpayEnabled,
            String razorpayKeyId,
            String razorpayKeySecret,
            String razorpayWebhookSecret,
            String razorpayBaseUrl) {
    }

    public record Shipping(
            BigDecimal freeShippingThreshold,
            BigDecimal standardFee,
            BigDecimal expressFee,
            BigDecimal sameDayFee) {
    }

    public record Admin(String email, String password, String name) {
    }

    public record RateLimit(int aiPerMinute, int authPerMinute, int publicPerMinute) {
    }

    public record Orders(Duration pendingPaymentTtl, int maxPendingPerUser) {
    }

    public record Mail(String from) {
    }

    /**
     * Reverse geocoding for the checkout's "Use my current location" button. The default provider is
     * OpenStreetMap's public Nominatim service (no key; at most 1 request per second, identified by User-Agent).
     */
    public record Geo(boolean enabled, String baseUrl, String userAgent, Duration timeout) {
    }
}
