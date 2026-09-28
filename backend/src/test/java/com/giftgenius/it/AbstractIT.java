package com.giftgenius.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.giftgenius.ai.LlmClient;
import com.giftgenius.notify.Mailer;
import com.sun.net.httpserver.HttpServer;

import jakarta.servlet.http.Cookie;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Boots the whole application against a real MySQL database (Flyway-cleaned once per run) with a
 * fake Razorpay API on localhost. The LLM and outgoing mail are mocked so tests are deterministic.
 *
 * <p>Database settings come from IT_DB_URL, IT_DB_USERNAME and IT_DB_PASSWORD.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(AbstractIT.CleanDatabase.class)
public abstract class AbstractIT {

    protected static final String ADMIN_EMAIL = "admin@it.test";
    protected static final String ADMIN_PASSWORD = "admin-password-123";
    protected static final String RZP_KEY_SECRET = "it-key-secret";
    protected static final String RZP_WEBHOOK_SECRET = "it-webhook-secret";
    protected static final JsonMapper JSON = JsonMapper.builder().build();

    /** Fake Razorpay: POST /v1/orders returns a new order id, or 500 while {@link #RAZORPAY_DOWN} is set. */
    protected static final AtomicBoolean RAZORPAY_DOWN = new AtomicBoolean(false);
    private static final AtomicInteger RZP_SEQ = new AtomicInteger();
    private static final HttpServer RAZORPAY = startFakeRazorpay();

    /** Fake Nominatim on the same local server: GET /reverse. Mode: "ok", "down" (500) or "empty" (no address). */
    protected static final java.util.concurrent.atomic.AtomicReference<String> GEO_MODE =
            new java.util.concurrent.atomic.AtomicReference<>("ok");
    /** The last /reverse request seen by the fake: query string and User-Agent. */
    protected static final java.util.concurrent.atomic.AtomicReference<String[]> GEO_LAST_REQUEST =
            new java.util.concurrent.atomic.AtomicReference<>();

    @Autowired
    protected MockMvc mvc;

    @MockitoBean
    protected LlmClient llm;

    @MockitoBean
    protected Mailer mailer;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", () -> env("IT_DB_URL",
                "jdbc:mysql://localhost:3306/giftgenius_test?serverTimezone=UTC&characterEncoding=UTF-8"
                        + "&allowPublicKeyRetrieval=true"));
        r.add("spring.datasource.username", () -> env("IT_DB_USERNAME", "giftgenius"));
        r.add("spring.datasource.password", () -> env("IT_DB_PASSWORD", ""));
        r.add("spring.flyway.clean-disabled", () -> "false");
        r.add("management.server.port", () -> "-1");
        r.add("app.security.jwt-secret", () -> "integration-test-secret-that-is-long-enough-1234");
        r.add("app.security.cookie-secure", () -> "false");
        r.add("app.admin.email", () -> ADMIN_EMAIL);
        r.add("app.admin.password", () -> ADMIN_PASSWORD);
        r.add("app.payment.razorpay-enabled", () -> "true");
        r.add("app.payment.razorpay-key-id", () -> "rzp_test_it");
        r.add("app.payment.razorpay-key-secret", () -> RZP_KEY_SECRET);
        r.add("app.payment.razorpay-webhook-secret", () -> RZP_WEBHOOK_SECRET);
        r.add("app.payment.razorpay-base-url", () -> "http://127.0.0.1:" + RAZORPAY.getAddress().getPort());
        r.add("app.geo.enabled", () -> "true");
        r.add("app.geo.base-url", () -> "http://127.0.0.1:" + RAZORPAY.getAddress().getPort());
        // Rate limiting is covered by unit tests; every request here comes from 127.0.0.1.
        r.add("app.rate-limit.ai-per-minute", () -> "100000");
        r.add("app.rate-limit.auth-per-minute", () -> "100000");
        r.add("app.rate-limit.public-per-minute", () -> "100000");
    }

    @TestConfiguration
    static class CleanDatabase {
        @Bean
        FlywayMigrationStrategy cleanThenMigrate() {
            return flyway -> {
                flyway.clean();
                flyway.migrate();
            };
        }
    }

    private static String env(String name, String fallback) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? fallback : v;
    }

    private static HttpServer startFakeRazorpay() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/v1/orders", exchange -> {
                byte[] in = exchange.getRequestBody().readAllBytes();
                if (RAZORPAY_DOWN.get()) {
                    respond(exchange, 500, "{\"error\":{\"description\":\"down\"}}");
                    return;
                }
                JsonNode req = JSON.readTree(new String(in, StandardCharsets.UTF_8));
                String body = JSON.writeValueAsString(Map.of("id", "order_IT" + RZP_SEQ.incrementAndGet(),
                        "amount", req.path("amount").asLong(), "currency", "INR"));
                respond(exchange, 200, body);
            });
            server.createContext("/reverse", exchange -> {
                GEO_LAST_REQUEST.set(new String[] { exchange.getRequestURI().getRawQuery(),
                        exchange.getRequestHeaders().getFirst("User-Agent") });
                switch (GEO_MODE.get()) {
                    case "down" -> respond(exchange, 500, "{}");
                    case "empty" -> respond(exchange, 200, "{\"error\":\"Unable to geocode\"}");
                    default -> respond(exchange, 200, """
                            {"display_name":"12, MG Road, Shivajinagar, Pune, Maharashtra, 411005, India",
                             "address":{"house_number":"12","road":"MG Road","suburb":"Shivajinagar","city":"Pune",
                               "state_district":"Pune District","state":"Maharashtra","postcode":"411 005",
                               "country":"India","country_code":"in"}}""");
                }
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, int status, String body)
            throws IOException {
        byte[] out = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, out.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(out);
        }
    }

    // ── Helpers ────────────────────────────────────────────

    /** A signed-in session: bearer token plus the refresh cookie. */
    protected record Session(String accessToken, Cookie refreshCookie, long userId, String email) {
        MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder b) {
            return b.header("Authorization", "Bearer " + accessToken);
        }
    }

    protected static String uniqueEmail(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@it.test";
    }

    protected static String json(Object body) {
        return JSON.writeValueAsString(body);
    }

    protected static JsonNode body(MvcResult r) throws Exception {
        String s = r.getResponse().getContentAsString(StandardCharsets.UTF_8);
        return s.isEmpty() ? JSON.missingNode() : JSON.readTree(s);
    }

    protected MockHttpServletRequestBuilder postJson(String url, Object body) {
        return post(url).contentType(MediaType.APPLICATION_JSON).content(json(body));
    }

    protected Session register(String email) throws Exception {
        MvcResult r = mvc.perform(postJson("/api/auth/register",
                Map.of("fullName", "Test Shopper", "email", email, "password", "shopper-password-1")))
                .andExpect(status().isOk()).andReturn();
        return session(r, email);
    }

    protected Session login(String email, String password) throws Exception {
        MvcResult r = mvc.perform(postJson("/api/auth/login", Map.of("email", email, "password", password)))
                .andExpect(status().isOk()).andReturn();
        return session(r, email);
    }

    protected Session admin() throws Exception {
        return login(ADMIN_EMAIL, ADMIN_PASSWORD);
    }

    protected static Session session(MvcResult r, String email) throws Exception {
        JsonNode b = body(r);
        return new Session(b.path("accessToken").asString(), r.getResponse().getCookie("gg_refresh"),
                b.path("user").path("id").asLong(), email);
    }

    protected int stockOf(long productId) throws Exception {
        return body(mvc.perform(get("/api/products/" + productId)).andReturn()).path("stock").asInt();
    }

    protected void addToCart(Session s, long productId, int qty) throws Exception {
        mvc.perform(s.auth(postJson("/api/cart/items", Map.of("productId", productId, "quantity", qty))))
                .andExpect(status().isOk());
    }

    protected static Map<String, Object> shipping(String email) {
        return Map.of("fullName", "Asha Rao", "email", email, "phone", "+91 98765 43210",
                "addressLine", "12 MG Road", "city", "Pune", "state", "Maharashtra", "pincode", "411001");
    }
}
