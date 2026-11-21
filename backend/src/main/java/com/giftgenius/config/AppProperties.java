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

    /**
     * @param dailyCallLimit cost safeguard: at most this many model calls per day (then rules answer)
     * @param quotaCooldown  after the provider reports its quota is exhausted, no calls for this long
     */
    public record Ai(boolean enabled, String apiKey, String model, String baseUrl, Duration timeout,
            int dailyCallLimit, Duration quotaCooldown) {
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

    /**
     * @param outbox            order emails: queued in the email_outbox table with the order, then delivered in the
     *                          background
     * @param notifyAdminEmails who is told about each new order (NOTIFY_ADMIN_EMAILS, comma-separated); when empty,
     *                          the admin account's address (ADMIN_EMAIL) is used
     * @param timeZone          the zone order emails show times in (MAIL_TIME_ZONE), for example Asia/Kolkata
     */
    public record Mail(String from, Outbox outbox, List<String> notifyAdminEmails, String timeZone) {
    }

    /**
     * @param senderEnabled whether this instance delivers queued emails (they are queued either way); instances can
     *                      all run it, since each email is claimed by one sender only
     * @param pollInterval  how often to look for emails that are due (a new email also wakes the sender at once)
     * @param lease         how long a claimed email stays reserved for its sender; one still unfinished after this is
     *                      treated as interrupted and given up rather than sent again
     * @param batchSize     at most this many emails per pass
     * @param retryDelays   the wait before each retry after a failed attempt; there are as many retries as delays, so
     *                      at most {@code retryDelays.size() + 1} attempts
     */
    public record Outbox(boolean senderEnabled, Duration pollInterval, Duration lease, int batchSize,
            List<Duration> retryDelays) {
    }

    /**
     * Reverse geocoding for the checkout's "Use my current location" button. The default provider is
     * OpenStreetMap's public Nominatim service (no key; at most 1 request per second, identified by User-Agent).
     */
    public record Geo(boolean enabled, String baseUrl, String userAgent, Duration timeout) {
    }
}
