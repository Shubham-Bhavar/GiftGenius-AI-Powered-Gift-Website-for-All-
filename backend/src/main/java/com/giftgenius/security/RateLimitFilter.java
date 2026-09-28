package com.giftgenius.security;

import java.io.IOException;
import java.time.Clock;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.giftgenius.config.AppProperties;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Fixed-window, per-client-IP limiter for the expensive or abuse-prone endpoints:
 * AI calls cost money, auth endpoints attract credential stuffing, and the public lookups
 * (order tracking, newsletter, contact form, session refresh) can be abused for enumeration or spam.
 *
 * <p>The client IP is {@code request.getRemoteAddr()}, which Spring's forwarded-header support
 * derives from {@code X-Forwarded-For}. That is only trustworthy because nginx overwrites the
 * header with the real peer address (see frontend/nginx.conf). Never expose the backend directly.
 *
 * <p>In-memory, so each instance limits independently. Use Redis or the gateway when running replicas.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    /** Upper bound on tracked windows, so a flood of distinct IPs can't exhaust memory. */
    static final int MAX_TRACKED = 100_000;

    enum Bucket { AI, AUTH, PUBLIC }

    private record Window(long minute, AtomicInteger count) {
    }

    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final int aiPerMinute;
    private final int authPerMinute;
    private final int publicPerMinute;
    private Clock clock = Clock.systemUTC();

    public RateLimitFilter(AppProperties properties) {
        this.aiPerMinute = properties.rateLimit().aiPerMinute();
        this.authPerMinute = properties.rateLimit().authPerMinute();
        this.publicPerMinute = properties.rateLimit().publicPerMinute();
    }

    /** For tests. */
    void setClock(Clock clock) {
        this.clock = clock;
    }

    static Bucket bucketFor(String method, String path) {
        if (path.startsWith("/api/ai/")) {
            return Bucket.AI;
        }
        if (!"POST".equals(method) && !path.startsWith("/api/orders/track")) {
            return null;
        }
        if (path.equals("/api/auth/login") || path.equals("/api/auth/register")
                || path.startsWith("/api/auth/password/")) {
            return Bucket.AUTH;
        }
        if (path.equals("/api/auth/refresh") || path.startsWith("/api/orders/track")
                || path.startsWith("/api/newsletter/") || path.equals("/api/contact")
                || path.startsWith("/api/location/")) {
            return Bucket.PUBLIC;
        }
        return null;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return bucketFor(request.getMethod(), request.getRequestURI()) == null;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Bucket bucket = bucketFor(request.getMethod(), request.getRequestURI());
        int limit = switch (bucket) {
            case AI -> aiPerMinute;
            case AUTH -> authPerMinute;
            case PUBLIC -> publicPerMinute;
        };
        if (!tryAcquire(bucket + ":" + request.getRemoteAddr(), limit)) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader("Retry-After", "60");
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.getWriter().write(
                    "{\"status\":429,\"title\":\"Too Many Requests\",\"detail\":\"Too many requests. Wait a minute and try again.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    boolean tryAcquire(String key, int limit) {
        long minute = clock.millis() / 60_000;
        if (windows.size() >= MAX_TRACKED) {
            evictOldWindows();
        }
        Window w = windows.compute(key, (k, existing) ->
                existing == null || existing.minute() != minute ? new Window(minute, new AtomicInteger()) : existing);
        return w.count().incrementAndGet() <= limit;
    }

    @Scheduled(fixedDelay = 120_000)
    void evictOldWindows() {
        long current = clock.millis() / 60_000;
        windows.entrySet().removeIf(e -> e.getValue().minute() < current);
    }

    int trackedWindows() {
        return windows.size();
    }
}
