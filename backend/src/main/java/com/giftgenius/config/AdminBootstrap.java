package com.giftgenius.config;

import java.time.Instant;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.giftgenius.auth.PasswordResetTokenRepository;
import com.giftgenius.auth.RefreshTokenRepository;
import com.giftgenius.user.Role;
import com.giftgenius.user.User;
import com.giftgenius.user.UserRepository;

/**
 * Makes sure the account named by ADMIN_EMAIL is an admin that signs in with ADMIN_PASSWORD.
 *
 * <ul>
 *   <li>No account with that email: an admin account is created.</li>
 *   <li>That account is already an admin: nothing changes (its password may have been changed since).</li>
 *   <li>That account is a customer (e.g. the owner signed up in the shop first): it is promoted to admin,
 *       <b>its password is replaced by ADMIN_PASSWORD</b>, and its sessions and reset links are revoked.
 *       Sign-up doesn't prove email ownership, so without the password reset whoever registered that email
 *       first would become admin; with it, only the holder of ADMIN_PASSWORD can sign in as admin.</li>
 * </ul>
 * ADMIN_PASSWORD must be at least 12 characters. It is never logged.
 */
@Component
public class AdminBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);
    static final int MIN_PASSWORD_LENGTH = 12;

    private final AppProperties properties;
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordResetTokenRepository resetTokens;

    public AdminBootstrap(AppProperties properties, UserRepository users, PasswordEncoder encoder,
            RefreshTokenRepository refreshTokens, PasswordResetTokenRepository resetTokens) {
        this.properties = properties;
        this.users = users;
        this.encoder = encoder;
        this.refreshTokens = refreshTokens;
        this.resetTokens = resetTokens;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        AppProperties.Admin admin = properties.admin();
        if (admin == null || !StringUtils.hasText(admin.email()) || !StringUtils.hasText(admin.password())) {
            return;
        }
        String email = admin.email().trim().toLowerCase();
        Optional<User> existing = users.findByEmailIgnoreCase(email);
        if (existing.isPresent() && existing.get().getRole() == Role.ADMIN) {
            return;
        }
        if (admin.password().length() < MIN_PASSWORD_LENGTH) {
            log.warn("ADMIN_PASSWORD is shorter than {} characters; admin account {} not {}.", MIN_PASSWORD_LENGTH,
                    email, existing.isPresent() ? "promoted" : "created");
            return;
        }

        if (existing.isPresent()) {
            User user = existing.get();
            Instant now = Instant.now();
            user.setRole(Role.ADMIN);
            user.setPasswordHash(encoder.encode(admin.password()));
            users.save(user);
            refreshTokens.revokeAllForUser(user.getId(), now);
            resetTokens.invalidateAllForUser(user.getId(), now);
            log.warn("Promoted existing customer account {} to ADMIN (ADMIN_EMAIL). It now signs in with "
                    + "ADMIN_PASSWORD, and its previous sessions were signed out.", email);
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
