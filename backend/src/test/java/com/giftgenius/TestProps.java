package com.giftgenius;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.PropertySourcesPlaceholdersResolver;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

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
                new AppProperties.Mail("test@giftgenius.local", outbox(), List.of(), "Asia/Kolkata"), null);
    }

    public static AppProperties defaults() {
        return withSecurity(security(JWT_SECRET));
    }

    /**
     * The outbox exactly as the production application.yml configures it (environment placeholders take their
     * defaults), bound the way Spring Boot binds it. Read from the file, not copied, so tests can't drift from it.
     */
    public static AppProperties.Outbox outbox() {
        return fromApplicationYml("app.mail.outbox", AppProperties.Outbox.class);
    }

    /** One section of the production application.yml, bound to its type. */
    public static <T> T fromApplicationYml(String prefix, Class<T> type) {
        try {
            List<PropertySource<?>> yml = new YamlPropertySourceLoader().load("application.yml",
                    new ClassPathResource("application.yml"));
            Binder binder = new Binder(ConfigurationPropertySources.from(yml),
                    new PropertySourcesPlaceholdersResolver(yml));
            return binder.bind(prefix, type).get();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static AppProperties.Shipping shipping() {
        return new AppProperties.Shipping(new BigDecimal("999"), new BigDecimal("49"), new BigDecimal("99"),
                new BigDecimal("149"));
    }
}
