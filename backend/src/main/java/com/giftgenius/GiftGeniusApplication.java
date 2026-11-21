package com.giftgenius;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableScheduling;

// Sign-in is JWT only (SecurityConfig). Without the exclusion Spring Boot creates an unused in-memory "user" and
// writes its generated password to the log on every start.
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@ConfigurationPropertiesScan
@EnableCaching
@EnableScheduling
public class GiftGeniusApplication {

    public static void main(String[] args) {
        SpringApplication.run(GiftGeniusApplication.class, args);
    }
}
