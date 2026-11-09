package com.giftgenius.config;

import static org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher.pathPattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.security.autoconfigure.actuate.web.servlet.EndpointRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

import com.giftgenius.security.MetricsScrapeToken;

import jakarta.servlet.http.HttpServletResponse;

/**
 * Security for the Actuator endpoints (health probes and Prometheus metrics, on the management port).
 *
 * <ul>
 * <li>{@code /actuator/health/liveness} and {@code /actuator/health/readiness} (GET): open, status only. The Docker
 * health check calls readiness from inside the container.</li>
 * <li>{@code /actuator/prometheus}, the overall {@code /actuator/health} and the endpoint list: only with
 * {@code Authorization: Bearer <METRICS_SCRAPE_TOKEN>}. With no token configured they are always refused.</li>
 * <li>Anything else under Actuator: refused.</li>
 * </ul>
 *
 * <p>This chain comes before the API's ({@link SecurityConfig}). Spring Boot applies the application's security
 * filter chain to the management port as well, and {@link EndpointRequest} matches Actuator requests wherever they are
 * served: on the management port, or on the API port if MANAGEMENT_PORT is ever set to the same port as PORT. On the
 * API port with a separate management port there is no Actuator at all, and the API chain answers 401 or 404.
 */
@Configuration
public class ManagementSecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(ManagementSecurityConfig.class);

    @Bean
    @Order(1)
    public SecurityFilterChain managementSecurityFilterChain(HttpSecurity http,
            @Value("${management.endpoints.web.base-path:/actuator}") String basePath,
            @Value("${app.management.metrics-scrape-token:}") String token) throws Exception {
        MetricsScrapeToken scrapeToken = new MetricsScrapeToken(token);
        if (!scrapeToken.configured()) {
            log.warn("METRICS_SCRAPE_TOKEN is not set: Prometheus metrics are refused to every caller. "
                    + "Liveness and readiness probes stay open.");
        } else if (scrapeToken.shorterThanRecommended()) {
            log.warn("METRICS_SCRAPE_TOKEN is shorter than {} characters; use a longer random value.",
                    MetricsScrapeToken.RECOMMENDED_MIN_LENGTH);
        }
        String base = basePath.endsWith("/") ? basePath.substring(0, basePath.length() - 1) : basePath;

        http
            .securityMatcher(EndpointRequest.toAnyEndpoint())
            .csrf(AbstractHttpConfigurer::disable)
            .cors(AbstractHttpConfigurer::disable)
            .httpBasic(AbstractHttpConfigurer::disable)
            .formLogin(AbstractHttpConfigurer::disable)
            .logout(AbstractHttpConfigurer::disable)
            .requestCache(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(pathPattern(HttpMethod.GET, base + "/health/liveness"),
                        pathPattern(HttpMethod.GET, base + "/health/readiness")).permitAll()
                .requestMatchers(EndpointRequest.to("prometheus"), EndpointRequest.to("health"),
                        EndpointRequest.toLinks()).access(scrapeToken)
                .anyRequest().denyAll())
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((req, res, e) -> refuse(res, HttpStatus.UNAUTHORIZED))
                .accessDeniedHandler((req, res, e) -> refuse(res, HttpStatus.FORBIDDEN)));
        return http.build();
    }

    private static void refuse(HttpServletResponse res, HttpStatus status) throws java.io.IOException {
        res.setStatus(status.value());
        if (status == HttpStatus.UNAUTHORIZED) {
            res.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
        }
        res.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        res.getWriter().write("{\"status\":" + status.value() + ",\"title\":\"" + status.getReasonPhrase() + "\"}");
    }
}
