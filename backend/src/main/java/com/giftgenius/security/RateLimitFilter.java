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
import org.springframework.web.util.UrlPathHelper;

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
 * <p>The client IP is {@code request.getRemoteAddr()}. With {@code server.forward-headers-strategy: native}
 * (the default in application.yml) Tomcat sets it from {@code X-Forwarded-For} only when the request comes from a
 * trusted proxy address ({@code server.tomcat.remoteip.internal-proxies}: private and loopback ranges by default),
 * taking the right-most address that isn't a trusted proxy; a client can't choose it by sending its own header, and
 * the {@code Forwarded} and {@code X-Forwarded-Prefix} headers are not used. Requests are classified on their decoded
 * path, so {@code /api/auth/%6cogin} counts as a sign-in.
 *
 * <p>The number of tracked windows is bounded: once it is reached within one minute, new clients share one overflow
 * window per bucket, which may limit them sooner but never lets memory grow.
 *
 * <p>In-memory, so each instance limits independently. Use Redis or the gateway when running replicas.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    /** Upper bound on tracked windows, so a flood of distinct IPs can't exhaust memory. */
    static final int MAX_TRACKED = 100_000;
    private static final UrlPathHelper PATHS = UrlPathHelper.defaultInstance;

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
        if (path.equals("/api/auth/refresh") || path.startsWith("/api/orders/track") || path.equals("/api/orders")
                || path.startsWith("/api/newsletter/") || path.equals("/api/contact")
                || path.startsWith("/api/location/")) {
            return Bucket.PUBLIC;
        }
        return null;
    }

    /** The request's path within the application, decoded ("/api/auth/%6cogin" is "/api/auth/login"). */
    static String pathOf(HttpServletRequest request) {
        return PATHS.getPathWithinApplication(request);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return bucketFor(request.getMethod(), pathOf(request)) == null;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Bucket bucket = bucketFor(request.getMethod(), pathOf(request));
        int limit = switch (bucket) {
            case AI -> aiPerMinute;
            case AUTH -> authPerMinute;
            case PUBLIC -> publicPerMinute;
        };
        if (!tryAcquire(bucket.name(), request.getRemoteAddr(), limit)) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader("Retry-After", "60");
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.getWriter().write(
                    "{\"status\":429,\"title\":\"Too Many Requests\",\"detail\":\"Too many requests. Wait a minute and try again.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    boolean tryAcquire(String bucket, String client, int limit) {
        long minute = clock.millis() / 60_000;
        String key = bucket + ":" + client;
        if (windows.size() >= MAX_TRACKED && !windows.containsKey(key)) {
            evictOldWindows();
            if (windows.size() >= MAX_TRACKED) {
                key = bucket + ":overflow"; // a flood of new clients shares one window instead of growing the map
            }
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
