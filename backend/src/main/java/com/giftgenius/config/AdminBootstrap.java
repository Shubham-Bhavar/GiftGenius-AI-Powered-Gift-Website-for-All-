package com.giftgenius.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.giftgenius.user.Role;
import com.giftgenius.user.User;
import com.giftgenius.user.UserRepository;

/** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if that account doesn't exist yet. */
@Component
public class AdminBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

    private final AppProperties properties;
    private final UserRepository users;
    private final PasswordEncoder encoder;

    public AdminBootstrap(AppProperties properties, UserRepository users, PasswordEncoder encoder) {
        this.properties = properties;
        this.users = users;
        this.encoder = encoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        AppProperties.Admin admin = properties.admin();
        if (admin == null || !StringUtils.hasText(admin.email()) || !StringUtils.hasText(admin.password())) {
            return;
        }
        String email = admin.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(email)) {
            return;
        }
        if (admin.password().length() < 12) {
            log.warn("ADMIN_PASSWORD is shorter than 12 characters; admin account not created.");
            return;
        }
        User user = new User();
        user.setEmail(email);
        user.setFullName(admin.name());
        user.setPasswordHash(encoder.encode(admin.password()));
        user.setRole(Role.ADMIN);
        users.save(user);
        log.info("Created admin account {}", email);
    }
}
