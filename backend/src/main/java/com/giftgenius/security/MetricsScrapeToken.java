package com.giftgenius.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.function.Supplier;

import org.springframework.http.HttpHeaders;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

/**
 * Lets a request through only when it carries {@code Authorization: Bearer <token>} with the configured metrics
 * scrape token (METRICS_SCRAPE_TOKEN). With no token configured, or a blank one, nothing gets through.
 *
 * <p>The comparison is constant-time: both tokens are hashed with SHA-256 and the digests compared with
 * {@link MessageDigest#isEqual}, so neither the position of the first wrong character nor the token's length shows
 * in the response time. The token itself is never logged or kept, only its digest.
 */
public final class MetricsScrapeToken implements AuthorizationManager<RequestAuthorizationContext> {

    /** A shorter configured token works but is reported at startup. */
    public static final int RECOMMENDED_MIN_LENGTH = 32;
    private static final String BEARER = "Bearer ";

    /** SHA-256 of the configured token; null when none is configured. */
    private final byte[] expected;
    private final int length;

    public MetricsScrapeToken(String configured) {
        String token = configured == null ? "" : configured.strip();
        this.expected = token.isEmpty() ? null : sha256(token);
        this.length = token.length();
    }

    /** Whether a token is configured; without one every request is refused. */
    public boolean configured() {
        return expected != null;
    }

    /** Whether the configured token is shorter than {@link #RECOMMENDED_MIN_LENGTH}. */
    public boolean shorterThanRecommended() {
        return configured() && length < RECOMMENDED_MIN_LENGTH;
    }

    /** Whether this Authorization header value carries the configured token. */
    public boolean matches(String authorization) {
        if (expected == null || authorization == null) {
            return false;
        }
        String header = authorization.strip();
        if (header.length() <= BEARER.length() || !header.regionMatches(true, 0, BEARER, 0, BEARER.length())) {
            return false;
        }
        String presented = header.substring(BEARER.length()).strip();
        return !presented.isEmpty() && MessageDigest.isEqual(expected, sha256(presented));
    }

    @Override
    public AuthorizationResult authorize(Supplier<? extends Authentication> authentication,
            RequestAuthorizationContext context) {
        return new AuthorizationDecision(matches(context.getRequest().getHeader(HttpHeaders.AUTHORIZATION)));
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is always available", e);
        }
    }
}
