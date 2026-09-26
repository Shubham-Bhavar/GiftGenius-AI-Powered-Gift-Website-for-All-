package com.giftgenius.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.giftgenius.auth.AuthDtos.AuthResponse;
import com.giftgenius.auth.AuthDtos.ChangePasswordRequest;
import com.giftgenius.auth.AuthDtos.IssuedTokens;
import com.giftgenius.auth.AuthDtos.LoginRequest;
import com.giftgenius.auth.AuthDtos.RegisterRequest;
import com.giftgenius.auth.AuthDtos.ResetPasswordRequest;
import com.giftgenius.auth.AuthDtos.UpdateProfileRequest;
import com.giftgenius.auth.AuthDtos.UserDto;
import com.giftgenius.common.ApiException;
import com.giftgenius.config.AppProperties;
import com.giftgenius.notify.Mailer;
import com.giftgenius.security.JwtService;
import com.giftgenius.user.Role;
import com.giftgenius.user.User;
import com.giftgenius.user.UserRepository;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String SESSION_EXPIRED = "Session expired. Please sign in again.";

    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordResetTokenRepository resetTokens;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final Mailer mailer;
    private final AppProperties.Security props;
    private final String publicUrl;
    /** Compared against when the email is unknown, so login takes the same time either way. */
    private final String dummyHash;

    public AuthService(UserRepository users, RefreshTokenRepository refreshTokens,
            PasswordResetTokenRepository resetTokens, PasswordEncoder encoder, JwtService jwt, Mailer mailer,
            AppProperties properties) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.resetTokens = resetTokens;
        this.encoder = encoder;
        this.jwt = jwt;
        this.mailer = mailer;
        this.props = properties.security();
        this.publicUrl = stripTrailingSlash(properties.publicUrl());
        this.dummyHash = encoder.encode(randomToken());
    }

    @Transactional
    public IssuedTokens register(RegisterRequest req) {
        String email = req.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("An account with this email already exists. Sign in instead.");
        }
        User user = new User();
        user.setEmail(email);
        user.setFullName(req.fullName().trim());
        user.setPhone(StringUtils.hasText(req.phone()) ? req.phone().trim() : null);
        user.setPasswordHash(encodePassword(req.password()));
        user.setRole(Role.CUSTOMER);
        users.save(user);
        return issue(user);
    }

    @Transactional
    public IssuedTokens login(LoginRequest req) {
        User user = users.findByEmailIgnoreCase(req.email().trim()).orElse(null);
        boolean matches = encoder.matches(req.password(), user == null ? dummyHash : user.getPasswordHash());
        if (user == null || !matches) {
            throw ApiException.unauthorized("Incorrect email or password.");
        }
        if (!user.isEnabled()) {
            throw ApiException.forbidden("This account is disabled. Contact support.");
        }
        return issue(user);
    }

    /**
     * Rotates the refresh token. A token rotated within the grace window (a second tab refreshing at
     * the same moment) gets a fresh token too; any other reuse of a revoked token revokes every session.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public IssuedTokens refresh(String rawToken) {
        if (!StringUtils.hasText(rawToken)) {
            throw ApiException.unauthorized(SESSION_EXPIRED);
        }
        RefreshToken token = refreshTokens.findByTokenHash(hash(rawToken))
                .orElseThrow(() -> ApiException.unauthorized(SESSION_EXPIRED));
        User user = token.getUser();
        Instant now = Instant.now();
        if (token.isExpired() || !user.isEnabled()) {
            throw ApiException.unauthorized(SESSION_EXPIRED);
        }
        if (token.isRevoked()) {
            if (token.isWithinRotationGrace(now, props.refreshReuseGrace())) {
                return issue(user);
            }
            log.warn("Refresh token reuse detected for user {}; revoking all sessions", user.getId());
            refreshTokens.revokeAllForUser(user.getId(), now);
            throw ApiException.unauthorized(SESSION_EXPIRED);
        }
        token.setRevokedAt(now);
        token.setRotatedAt(now);
        return issue(user);
    }

    @Transactional
    public void logout(String rawToken) {
        if (!StringUtils.hasText(rawToken)) {
            return;
        }
        refreshTokens.findByTokenHash(hash(rawToken)).ifPresent(t -> {
            if (!t.isRevoked()) {
                t.setRevokedAt(Instant.now());
            }
            t.setRotatedAt(null);
        });
    }

    @Transactional(readOnly = true)
    public UserDto me(Long userId) {
        return UserDto.from(requireUser(userId));
    }

    @Transactional
    public UserDto updateProfile(Long userId, UpdateProfileRequest req) {
        User user = requireUser(userId);
        user.setFullName(req.fullName().trim());
        user.setPhone(StringUtils.hasText(req.phone()) ? req.phone().trim() : null);
        return UserDto.from(user);
    }

    /** Changes the password and signs out every other session. */
    @Transactional
    public IssuedTokens changePassword(Long userId, ChangePasswordRequest req) {
        User user = requireUser(userId);
        if (!encoder.matches(req.currentPassword(), user.getPasswordHash())) {
            throw ApiException.badRequest("Your current password is incorrect.");
        }
        user.setPasswordHash(encodePassword(req.newPassword()));
        refreshTokens.revokeAllForUser(user.getId(), Instant.now());
        return issue(user);
    }

    /** Always succeeds from the caller's view, so it can't be used to discover which emails have accounts. */
    @Transactional
    public void requestPasswordReset(String email) {
        users.findByEmailIgnoreCase(email.trim()).filter(User::isEnabled).ifPresent(user -> {
            Instant now = Instant.now();
            resetTokens.invalidateAllForUser(user.getId(), now);
            String raw = randomToken();
            PasswordResetToken t = new PasswordResetToken();
            t.setUser(user);
            t.setTokenHash(hash(raw));
            t.setExpiresAt(now.plus(props.passwordResetTtl()));
            resetTokens.save(t);
            long minutes = props.passwordResetTtl().toMinutes();
            mailer.send(user.getEmail(), "Reset your GiftGenius password", """
                    Hi %s,

                    We received a request to reset your GiftGenius password. Open this link to choose a new one:

                    %s/reset-password?token=%s

                    The link works once and expires in %d minutes. If you didn't ask for this, you can ignore
                    this email: your password hasn't changed.

                    — GiftGenius
                    """.formatted(firstName(user), publicUrl, raw, minutes));
        });
    }

    @Transactional
    public void resetPassword(ResetPasswordRequest req) {
        Instant now = Instant.now();
        PasswordResetToken t = resetTokens.findByTokenHash(hash(req.token().trim()))
                .filter(x -> x.isUsable(now))
                .orElseThrow(() -> ApiException.badRequest(
                        "This reset link is invalid or has expired. Request a new one."));
        User user = t.getUser();
        user.setPasswordHash(encodePassword(req.password()));
        resetTokens.invalidateAllForUser(user.getId(), now);
        refreshTokens.revokeAllForUser(user.getId(), now);
        mailer.send(user.getEmail(), "Your GiftGenius password was changed", """
                Hi %s,

                Your GiftGenius password was just changed and all your sessions were signed out.
                If this wasn't you, reset your password straight away and contact support.

                — GiftGenius
                """.formatted(firstName(user)));
    }

    public long refreshTtlSeconds() {
        return props.refreshTokenTtl().toSeconds();
    }

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void purgeExpiredTokens() {
        Instant cutoff = Instant.now().minus(1, ChronoUnit.DAYS);
        int removed = refreshTokens.deleteExpiredBefore(cutoff) + resetTokens.deleteExpiredBefore(cutoff);
        if (removed > 0) {
            log.info("Purged {} expired tokens", removed);
        }
    }

    /** BCrypt only uses the first 72 bytes, and newer Spring Security rejects longer input outright. */
    private String encodePassword(String raw) {
        if (raw.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw ApiException.badRequest("That password is too long. Use at most 72 characters.");
        }
        return encoder.encode(raw);
    }

    private User requireUser(Long userId) {
        return users.findById(userId).orElseThrow(() -> ApiException.unauthorized("Please sign in again."));
    }

    private IssuedTokens issue(User user) {
        String raw = randomToken();
        RefreshToken rt = new RefreshToken();
        rt.setUser(user);
        rt.setTokenHash(hash(raw));
        rt.setExpiresAt(Instant.now().plus(props.refreshTokenTtl()));
        refreshTokens.save(rt);

        AuthResponse body = new AuthResponse(jwt.issueAccessToken(user), jwt.accessTokenTtlSeconds(),
                UserDto.from(user));
        return new IssuedTokens(body, raw);
    }

    private static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String firstName(User user) {
        return user.getFullName().trim().split("\\s+")[0];
    }

    private static String stripTrailingSlash(String url) {
        return url != null && url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    static String hash(String raw) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
