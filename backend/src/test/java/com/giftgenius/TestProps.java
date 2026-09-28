package com.giftgenius;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;

import com.giftgenius.config.AppProperties;

/** AppProperties with sensible test defaults. */
public final class TestProps {

    public static final String JWT_SECRET = "a-very-long-test-secret-of-at-least-32-bytes!";

    private TestProps() {
    }

    public static AppProperties.Security security(String secret) {
        return new AppProperties.Security(secret, Duration.ofMinutes(15), Duration.ofDays(14), Duration.ofSeconds(30),
                Duration.ofMinutes(30), false, "Strict", List.of());
    }

    public static AppProperties withSecurity(AppProperties.Security security) {
        return new AppProperties("http://localhost:5173", security, null, null, shipping(), null,
                new AppProperties.RateLimit(10, 20, 30), new AppProperties.Orders(Duration.ofMinutes(30), 3),
                new AppProperties.Mail("test@giftgenius.local"), null);
    }

    public static AppProperties defaults() {
        return withSecurity(security(JWT_SECRET));
    }

    public static AppProperties.Shipping shipping() {
        return new AppProperties.Shipping(new BigDecimal("999"), new BigDecimal("49"), new BigDecimal("99"),
                new BigDecimal("149"));
    }
}
