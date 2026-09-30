package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

import tools.jackson.databind.JsonNode;

/**
 * The marketplace end to end against real MySQL: seller sign-up and review, product ownership (including
 * attempts to reach another seller's products), product approval, split orders and seller fulfilment.
 */
class SellerMarketplaceIT extends AbstractIT {

    private static final String SELLER_PASSWORD = "seller-password-1";

    @Autowired
    private JdbcTemplate jdbc;

    // ── Helpers ────────────────────────────────────────────

    private static Map<String, Object> application(String storeName) {
        return new HashMap<>(Map.of("storeName", storeName, "description", "Handmade gifts from Pune.",
                "businessCategory", "home decor", "phone", "+91 98765 43210", "addressLine", "7 FC Road",
                "city", "Pune", "state", "Maharashtra", "pincode", "411004"));
    }

    private MvcResult registerSeller(String email, String storeName) throws Exception {
        return mvc.perform(postJson("/api/auth/register", Map.of("fullName", "Sana Seller", "email", email,
                "password", SELLER_PASSWORD, "seller", application(storeName)))).andReturn();
    }

    /** A seller account whose store is still waiting for review. */
    private Session pendingSeller(String prefix) throws Exception {
        String email = uniqueEmail(prefix);
        MvcResult r = registerSeller(email, "Store " + UUID.randomUUID().toString().substring(0, 8));
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        return session(r, email);
    }

    /** A seller whose store an admin has approved. */
    private Session approvedSeller(String prefix) throws Exception {
        Session s = pendingSeller(prefix);
        mvc.perform(admin().auth(patch("/api/admin/sellers/" + s.userId() + "/approve"))).andExpect(status().isOk());
        return s;
    }

    private static Map<String, Object> productBody(String name, boolean submit) {
        return new HashMap<>(Map.of("name", name, "description", "A hand-poured soy candle in a glass jar.",
                "category", "home decor", "price", 450, "stock", 12, "image", "https://img.example.com/candle.jpg",
                "occasion", List.of("birthday"), "tags", List.of("Handmade", "calm"), "submit", submit));
    }

    private long createProduct(Session seller, String name, boolean submit) throws Exception {
        JsonNode p = body(mvc.perform(seller.auth(postJson("/api/seller/products", productBody(name, submit))))
                .andExpect(status().isCreated()).andReturn());
        return p.path("id").asLong();
    }

    /** A product a seller created and an admin approved: it is in the shop. */
    private long listedProduct(Session seller, String name) throws Exception {
        long id = createProduct(seller, name, true);
        mvc.perform(admin().auth(patch("/api/admin/products/" + id + "/approve"))).andExpect(status().isOk());
        return id;
    }

    private JsonNode placeCod(Session s) throws Exception {
        Map<String, Object> order = Map.of("shipping", shipping(s.email()), "deliveryType", "STANDARD",
                "paymentMethod", "COD");
        return body(mvc.perform(s.auth(postJson("/api/orders", order)).header("Idempotency-Key", UUID.randomUUID().toString()))
                .andExpect(status().isCreated()).andReturn());
    }

    private static Map<String, Object> fulfil(String status) {
        return Map.of("status", status, "note", "Courier: DTDC 12345");
    }

    // ── Registration, sign-in and roles ────────────────────

    @Test
    void sellerSignUpCreatesAPendingSellerAccountThatCanSignIn() throws Exception {
        String email = uniqueEmail("seller");
        JsonNode reg = body(registerSeller(email, "Sana's Candles"));
        assertThat(reg.path("user").path("role").asString()).isEqualTo("SELLER");
        assertThat(reg.path("user").path("sellerStatus").asString()).isEqualTo("PENDING");

        Session s = login(email, SELLER_PASSWORD);
        mvc.perform(s.auth(get("/api/auth/me"))).andExpect(jsonPath("$.role").value("SELLER"))
                .andExpect(jsonPath("$.sellerStatus").value("PENDING"));
        mvc.perform(s.auth(get("/api/seller/me"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.storeName").value("Sana's Candles"))
                .andExpect(jsonPath("$.slug").value("sanas-candles"))
                .andExpect(jsonPath("$.status").value("PENDING"));

        mvc.perform(postJson("/api/auth/login", Map.of("email", email, "password", "wrong-password-1")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void signUpNeverCreatesAnAdminAndStoreNamesAreUnique() throws Exception {
        String email = uniqueEmail("sneaky");
        mvc.perform(postJson("/api/auth/register", Map.of("fullName", "Sneaky", "email", email,
                "password", "sneaky-password-1", "role", "ADMIN"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.user.role").value("CUSTOMER"));

        String name = "Unique Store " + UUID.randomUUID().toString().substring(0, 6);
        assertThat(registerSeller(uniqueEmail("s1"), name).getResponse().getStatus()).isEqualTo(200);
        MvcResult dup = registerSeller(uniqueEmail("s2"), name.toUpperCase());
        assertThat(dup.getResponse().getStatus()).isEqualTo(409);

        Map<String, Object> bad = application("<b>Bold</b> Store");
        bad.put("pincode", "12");
        mvc.perform(postJson("/api/auth/register", Map.of("fullName", "X", "email", uniqueEmail("bad"),
                "password", "password-123", "seller", bad))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['seller.storeName']").value("Remove the < and > characters"))
                .andExpect(jsonPath("$.errors['seller.pincode']").value("Enter a 6-digit PIN code"));
    }

    @Test
    void anExistingCustomerCanOpenAStoreWithoutANewAccount() throws Exception {
        Session customer = register(uniqueEmail("shopper"));
        JsonNode res = body(mvc.perform(customer.auth(postJson("/api/auth/seller-application",
                application("Shopper Store " + UUID.randomUUID().toString().substring(0, 6)))))
                .andExpect(status().isOk()).andReturn());
        assertThat(res.path("user").path("role").asString()).isEqualTo("SELLER");
        Session asSeller = new Session(res.path("accessToken").asString(), null, customer.userId(), customer.email());
        mvc.perform(asSeller.auth(get("/api/seller/dashboard"))).andExpect(status().isOk());
        mvc.perform(asSeller.auth(postJson("/api/auth/seller-application", application("Second Store"))))
                .andExpect(status().isConflict());

        mvc.perform(admin().auth(postJson("/api/auth/seller-application", application("Admin Store"))))
                .andExpect(status().isConflict());
    }

    @Test
    void rolesAreEnforcedByTheApi() throws Exception {
        Session customer = register(uniqueEmail("cust"));
        Session seller = approvedSeller("roles");

        mvc.perform(get("/api/seller/me")).andExpect(status().isUnauthorized());
        mvc.perform(customer.auth(get("/api/seller/dashboard"))).andExpect(status().isForbidden());
        mvc.perform(customer.auth(postJson("/api/seller/products", productBody("Nope", false))))
                .andExpect(status().isForbidden());
        mvc.perform(seller.auth(get("/api/admin/stats"))).andExpect(status().isForbidden());
        mvc.perform(seller.auth(get("/api/admin/sellers"))).andExpect(status().isForbidden());
        mvc.perform(seller.auth(patch("/api/admin/sellers/" + seller.userId() + "/approve")))
                .andExpect(status().isForbidden());
        mvc.perform(admin().auth(get("/api/admin/sellers"))).andExpect(status().isOk());
        mvc.perform(admin().auth(get("/api/seller/dashboard"))).andExpect(status().isForbidden());
    }

    @Test
    void aSellerCantMakeThemselvesAdminByEditingTheirToken() throws Exception {
        Session seller = approvedSeller("forge");
        String[] parts = seller.accessToken().split("\\.");
        String payload = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8)
                .replace("\"SELLER\"", "\"ADMIN\"");
        String forged = parts[0] + "." + Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8)) + "." + parts[2];
        mvc.perform(get("/api/admin/stats").header("Authorization", "Bearer " + forged))
                .andExpect(status().isUnauthorized());
    }

    // ── Store review ───────────────────────────────────────

    @Test
    void pendingAndRejectedStoresCantSell() throws Exception {
        Session pending = pendingSeller("pending");
        // A pending store can prepare drafts, but not submit them.
        long draft = createProduct(pending, "Draft Candle", false);
        mvc.perform(pending.auth(get("/api/seller/products/" + draft))).andExpect(jsonPath("$.status").value("DRAFT"));
        mvc.perform(pending.auth(postJson("/api/seller/products", productBody("Too Early", true))))
                .andExpect(status().isForbidden());
        mvc.perform(pending.auth(post("/api/seller/products/" + draft + "/submit"))).andExpect(status().isForbidden());

        Session admin = admin();
        mvc.perform(admin.auth(get("/api/admin/sellers?status=PENDING"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == " + pending.userId() + ")]").exists());
        mvc.perform(admin.auth(patch("/api/admin/sellers/" + pending.userId() + "/reject")
                .contentType(MediaType.APPLICATION_JSON).content(json(Map.of("reason", "")))))
                .andExpect(status().isBadRequest());
        mvc.perform(admin.auth(patch("/api/admin/sellers/" + pending.userId() + "/reject")
                .contentType(MediaType.APPLICATION_JSON).content(json(Map.of("reason", "Please add a real address.")))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.store.status").value("REJECTED"));
        verify(mailer, atLeastOnce()).send(eq(pending.email()), contains("seller application"), anyString());

        // Rejected: still signs in, sees why, can't change products, can apply again.
        Session again = login(pending.email(), SELLER_PASSWORD);
        mvc.perform(again.auth(get("/api/seller/me"))).andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.statusReason").value("Please add a real address."));
        mvc.perform(again.auth(postJson("/api/seller/products", productBody("Rejected", false))))
                .andExpect(status().isForbidden());
        mvc.perform(again.auth(post("/api/seller/profile/reapply"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    void adminSellerDetailNeverExposesCredentials() throws Exception {
        Session seller = approvedSeller("detail");
        String detail = mvc.perform(admin().auth(get("/api/admin/sellers/" + seller.userId())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.email").value(seller.email()))
                .andExpect(jsonPath("$.store.status").value("APPROVED"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(detail).doesNotContainIgnoringCase("password").doesNotContain("$2a$");
    }

    // ── Products: ownership ────────────────────────────────

    @Test
    void aSellerOwnsTheirProductsAndCantTouchAnotherSellers() throws Exception {
        Session a = approvedSeller("owner-a");
        Session b = approvedSeller("owner-b");

        // Ownership comes from the session: seller, status and listing fields in the body are ignored.
        Map<String, Object> sneaky = productBody("Owner Candle", false);
        sneaky.putAll(Map.of("sellerId", b.userId(), "seller", Map.of("slug", "someone-else"), "status", "APPROVED",
                "active", true, "rating", 5));
        JsonNode created = body(mvc.perform(a.auth(postJson("/api/seller/products", sneaky)))
                .andExpect(status().isCreated()).andReturn());
        long id = created.path("id").asLong();
        assertThat(created.path("status").asString()).isEqualTo("DRAFT");
        assertThat(created.path("active").asBoolean()).isFalse();
        assertThat(created.path("rating").asDouble()).isZero();
        String ownerOnDisk = jdbc.queryForObject("select seller_id from products where id = ?", String.class, id);
        assertThat(ownerOnDisk).isEqualTo(String.valueOf(a.userId()));

        mvc.perform(a.auth(get("/api/seller/products/" + id))).andExpect(status().isOk());
        Map<String, Object> edit = productBody("Owner Candle", false);
        edit.put("price", 399);
        mvc.perform(a.auth(put("/api/seller/products/" + id).contentType(MediaType.APPLICATION_JSON).content(json(edit))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.price").value(399));

        // Seller B, trying seller A's product by id.
        mvc.perform(b.auth(get("/api/seller/products/" + id))).andExpect(status().isForbidden());
        edit.put("price", 1);
        mvc.perform(b.auth(put("/api/seller/products/" + id).contentType(MediaType.APPLICATION_JSON).content(json(edit))))
                .andExpect(status().isForbidden());
        mvc.perform(b.auth(post("/api/seller/products/" + id + "/submit"))).andExpect(status().isForbidden());
        mvc.perform(b.auth(delete("/api/seller/products/" + id))).andExpect(status().isForbidden());
        mvc.perform(b.auth(get("/api/seller/products"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == " + id + ")]").doesNotExist());
        // Nor GiftGenius's own products.
        mvc.perform(b.auth(put("/api/seller/products/1").contentType(MediaType.APPLICATION_JSON).content(json(edit))))
                .andExpect(status().isForbidden());
        mvc.perform(b.auth(get("/api/seller/products/999999"))).andExpect(status().isNotFound());

        mvc.perform(a.auth(get("/api/seller/products/" + id))).andExpect(jsonPath("$.price").value(399));
        mvc.perform(a.auth(delete("/api/seller/products/" + id))).andExpect(status().isNoContent());
        mvc.perform(a.auth(get("/api/seller/products/" + id))).andExpect(jsonPath("$.status").value("ARCHIVED"));
    }

    @Test
    void productInputIsValidated() throws Exception {
        Session s = approvedSeller("validate");
        Map<String, Object> bad = productBody("<script>alert(1)</script>", false);
        bad.put("image", "javascript:alert(1)");
        bad.put("price", 0);
        bad.put("stock", -1);
        mvc.perform(s.auth(postJson("/api/seller/products", bad))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name").value("Remove the < and > characters"))
                .andExpect(jsonPath("$.errors.image").exists())
                .andExpect(jsonPath("$.errors.price").exists())
                .andExpect(jsonPath("$.errors.stock").exists());

        Map<String, Object> category = productBody("Odd Category", false);
        category.put("category", "weapons");
        mvc.perform(s.auth(postJson("/api/seller/products", category))).andExpect(status().isBadRequest());

        Map<String, Object> http = productBody("Plain Http", false);
        http.put("image", "http://img.example.com/x.jpg");
        mvc.perform(s.auth(postJson("/api/seller/products", http))).andExpect(status().isBadRequest());

        Map<String, Object> compare = productBody("Compare", false);
        compare.put("compareAtPrice", 100);
        mvc.perform(s.auth(postJson("/api/seller/products", compare))).andExpect(status().isBadRequest());
    }

    // ── Products: review and the public catalog ────────────

    @Test
    void onlyApprovedProductsReachTheShop() throws Exception {
        Session s = approvedSeller("review");
        String slug = body(mvc.perform(s.auth(get("/api/seller/me"))).andReturn()).path("slug").asString();
        long id = createProduct(s, "Review Candle", true);
        mvc.perform(s.auth(get("/api/seller/products/" + id))).andExpect(jsonPath("$.status").value("PENDING_APPROVAL"));
        mvc.perform(get("/api/products/" + id)).andExpect(status().isNotFound());
        assertThat(body(mvc.perform(get("/api/products?q=Review Candle")).andReturn()).path("content")).isEmpty();

        Session admin = admin();
        mvc.perform(admin.auth(get("/api/admin/products?status=PENDING_APPROVAL&size=100")))
                .andExpect(jsonPath("$.content[?(@.id == " + id + ")].seller.storeName").exists());
        mvc.perform(admin.auth(get("/api/admin/products/" + id))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING_APPROVAL"));
        mvc.perform(s.auth(get("/api/admin/products/" + id))).andExpect(status().isForbidden());
        mvc.perform(s.auth(patch("/api/admin/products/" + id + "/approve"))).andExpect(status().isForbidden());
        mvc.perform(admin.auth(patch("/api/admin/products/1/approve"))).andExpect(status().isConflict());

        mvc.perform(admin.auth(patch("/api/admin/products/" + id + "/approve"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED")).andExpect(jsonPath("$.active").value(true));
        mvc.perform(get("/api/products/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.seller.slug").value(slug))
                .andExpect(jsonPath("$.rejectionReason").doesNotExist());
        mvc.perform(get("/api/products?store=" + slug)).andExpect(jsonPath("$.content[0].id").value(id));
        mvc.perform(get("/api/stores/" + slug)).andExpect(status().isOk())
                .andExpect(jsonPath("$.productCount").value(1))
                .andExpect(jsonPath("$.phone").doesNotExist())
                .andExpect(jsonPath("$.addressLine").doesNotExist());

        // Price and stock changes go live at once; changing what the product is needs another review.
        Map<String, Object> edit = productBody("Review Candle", false);
        edit.put("price", 425);
        mvc.perform(s.auth(put("/api/seller/products/" + id).contentType(MediaType.APPLICATION_JSON).content(json(edit))))
                .andExpect(jsonPath("$.status").value("APPROVED"));
        mvc.perform(get("/api/products/" + id)).andExpect(jsonPath("$.price").value(425));
        edit.put("name", "Review Candle XL");
        mvc.perform(s.auth(put("/api/seller/products/" + id).contentType(MediaType.APPLICATION_JSON).content(json(edit))))
                .andExpect(jsonPath("$.status").value("PENDING_APPROVAL"));
        mvc.perform(get("/api/products/" + id)).andExpect(status().isNotFound());

        mvc.perform(admin.auth(patch("/api/admin/products/" + id + "/reject").contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("reason", "Use a photo of the actual candle.")))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"));
        mvc.perform(s.auth(get("/api/seller/products/" + id)))
                .andExpect(jsonPath("$.rejectionReason").value("Use a photo of the actual candle."));
        mvc.perform(s.auth(post("/api/seller/products/" + id + "/submit"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING_APPROVAL"))
                .andExpect(jsonPath("$.rejectionReason").doesNotExist());
    }

    @Test
    void suspendingAStoreHidesItsProductsUntilReactivated() throws Exception {
        Session s = approvedSeller("suspend");
        String slug = body(mvc.perform(s.auth(get("/api/seller/me"))).andReturn()).path("slug").asString();
        long id = listedProduct(s, "Suspend Candle");
        Session admin = admin();

        mvc.perform(admin.auth(patch("/api/admin/sellers/" + s.userId() + "/suspend")
                .contentType(MediaType.APPLICATION_JSON).content(json(Map.of("reason", "Late deliveries.")))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.store.status").value("SUSPENDED"));
        mvc.perform(get("/api/products/" + id)).andExpect(status().isNotFound());
        mvc.perform(get("/api/stores/" + slug)).andExpect(status().isNotFound());
        mvc.perform(s.auth(postJson("/api/seller/products", productBody("While Suspended", false))))
                .andExpect(status().isForbidden());

        mvc.perform(admin.auth(patch("/api/admin/sellers/" + s.userId() + "/reactivate"))).andExpect(status().isOk());
        mvc.perform(get("/api/products/" + id)).andExpect(status().isOk());
        mvc.perform(get("/api/stores/" + slug)).andExpect(status().isOk());
    }

    @Test
    void theDatabaseRefusesAListedProductThatIsntApproved() {
        Long id = jdbc.queryForObject("select min(id) from products where seller_id is null and active = true",
                Long.class);
        assertThatThrownBy(() -> jdbc.update("update products set status = 'DRAFT' where id = ?", id))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    void theOriginalCatalogIsUnchanged() throws Exception {
        assertThat(jdbc.queryForObject("select count(*) from products where id between 1 and 20 "
                + "and seller_id is null and status = 'APPROVED'", Integer.class)).isEqualTo(20);
        mvc.perform(get("/api/products/1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Luxury Hamper Box"))
                .andExpect(jsonPath("$.seller").doesNotExist())
                .andExpect(jsonPath("$.status").value("APPROVED"));
    }

    // ── Orders ─────────────────────────────────────────────

    @Test
    void aSplitOrderShowsEachSellerOnlyTheirOwnLines() throws Exception {
        Session a = approvedSeller("split-a");
        Session b = approvedSeller("split-b");
        Session c = approvedSeller("split-c");
        long productA = listedProduct(a, "Split Candle A");
        long productB = listedProduct(b, "Split Mug B");

        Session customer = register(uniqueEmail("split-buyer"));
        addToCart(customer, productA, 2);
        addToCart(customer, productB, 1);
        addToCart(customer, 6, 1); // GiftGenius's own Artisan Chocolate Box
        JsonNode order = placeCod(customer);
        String number = order.path("orderNumber").asString();
        assertThat(order.path("items")).hasSize(3);
        verify(mailer, atLeastOnce()).send(eq(a.email()), contains(number), anyString());

        // The customer sees one order with every line and who sells it.
        mvc.perform(customer.auth(get("/api/orders/" + number))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(3))
                .andExpect(jsonPath("$.items[?(@.productId == " + productA + ")].seller.storeName").exists())
                .andExpect(jsonPath("$.items[?(@.productId == 6)].seller").doesNotExist());

        // Seller A: only their line, their share of the money, and the delivery address; nothing else.
        String viewA = mvc.perform(a.auth(get("/api/seller/orders/" + number))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].productId").value(productA))
                .andExpect(jsonPath("$.sellerTotal").value(900.0))
                .andExpect(jsonPath("$.shipping.city").value("Pune"))
                .andExpect(jsonPath("$.fulfillmentStatus").value("NEW"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(viewA).doesNotContain("Split Mug B").doesNotContain("Artisan Chocolate Box")
                .doesNotContain(customer.email()).doesNotContain("\"total\"").doesNotContain("couponCode");
        mvc.perform(a.auth(get("/api/seller/orders"))).andExpect(jsonPath("$.content[0].orderNumber").value(number))
                .andExpect(jsonPath("$.content[0].lineCount").value(1));
        mvc.perform(b.auth(get("/api/seller/orders/" + number))).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].productId").value(productB));
        mvc.perform(c.auth(get("/api/seller/orders/" + number))).andExpect(status().isNotFound());
        mvc.perform(customer.auth(get("/api/seller/orders/" + number))).andExpect(status().isForbidden());

        // The admin list names everyone selling in the order: both stores and GiftGenius.
        JsonNode adminList = body(mvc.perform(admin().auth(get("/api/admin/orders?size=100"))).andExpect(status().isOk())
                .andReturn());
        JsonNode summary = null;
        for (JsonNode o : adminList.path("content")) {
            if (o.path("orderNumber").asString().equals(number)) {
                summary = o;
            }
        }
        assertThat(summary).isNotNull();
        assertThat(summary.path("sellers").toString()).contains("GiftGenius")
                .contains(body(mvc.perform(a.auth(get("/api/seller/me"))).andReturn()).path("storeName").asString())
                .contains(body(mvc.perform(b.auth(get("/api/seller/me"))).andReturn()).path("storeName").asString());

        // Seller A ships their parcel: only their line moves; the mixed order stays with GiftGenius.
        mvc.perform(a.auth(patch("/api/seller/orders/" + number + "/status").contentType(MediaType.APPLICATION_JSON)
                .content(json(fulfil("SHIPPED"))))).andExpect(status().isOk())
                .andExpect(jsonPath("$.fulfillmentStatus").value("SHIPPED"))
                .andExpect(jsonPath("$.orderStatus").value("CONFIRMED"));
        mvc.perform(b.auth(get("/api/seller/orders/" + number))).andExpect(jsonPath("$.fulfillmentStatus").value("NEW"));
        mvc.perform(a.auth(patch("/api/seller/orders/" + number + "/status").contentType(MediaType.APPLICATION_JSON)
                .content(json(fulfil("PACKED"))))).andExpect(status().isConflict());
        mvc.perform(c.auth(patch("/api/seller/orders/" + number + "/status").contentType(MediaType.APPLICATION_JSON)
                .content(json(fulfil("SHIPPED"))))).andExpect(status().isNotFound());

        mvc.perform(customer.auth(get("/api/orders/" + number)))
                .andExpect(jsonPath("$.items[?(@.productId == " + productA + ")].fulfillmentStatus").value("SHIPPED"))
                .andExpect(jsonPath("$.items[?(@.productId == " + productB + ")].fulfillmentStatus").value("NEW"));
        verify(mailer, atLeastOnce()).send(eq(customer.email()), contains(number), contains("on its way"));
        // Part of the order is on its way, so the customer can no longer cancel it.
        mvc.perform(customer.auth(post("/api/orders/" + number + "/cancel"))).andExpect(status().isConflict());

        // Seller figures come from their own lines only.
        mvc.perform(a.auth(get("/api/seller/dashboard"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.stats.orders").value(1))
                .andExpect(jsonPath("$.stats.unitsSold").value(2))
                .andExpect(jsonPath("$.stats.grossSales").value(900.0))
                .andExpect(jsonPath("$.stats.averageOrderValue").value(900.0))
                .andExpect(jsonPath("$.recentOrders[0].orderNumber").value(number));
        mvc.perform(a.auth(get("/api/seller/analytics")))
                .andExpect(jsonPath("$.topProducts[0].productId").value(productA))
                .andExpect(jsonPath("$.topProducts[0].unitsSold").value(2));
    }

    @Test
    void anOrderFromOneSellerFollowsTheirFulfilment() throws Exception {
        Session s = approvedSeller("rollup");
        long product = listedProduct(s, "Rollup Candle");
        Session customer = register(uniqueEmail("rollup-buyer"));
        addToCart(customer, product, 1);
        String number = placeCod(customer).path("orderNumber").asString();

        mvc.perform(s.auth(patch("/api/seller/orders/" + number + "/status").contentType(MediaType.APPLICATION_JSON)
                .content(json(fulfil("PACKED"))))).andExpect(jsonPath("$.orderStatus").value("PACKED"));
        mvc.perform(s.auth(patch("/api/seller/orders/" + number + "/status").contentType(MediaType.APPLICATION_JSON)
                .content(json(fulfil("SHIPPED"))))).andExpect(jsonPath("$.orderStatus").value("SHIPPED"));
        mvc.perform(customer.auth(get("/api/orders/" + number))).andExpect(jsonPath("$.status").value("SHIPPED"))
                .andExpect(jsonPath("$.timeline[-1].note").value("Courier: DTDC 12345"))
                .andExpect(jsonPath("$.items[0].fulfillmentNote").value("Courier: DTDC 12345"));
        mvc.perform(s.auth(patch("/api/seller/orders/" + number + "/status").contentType(MediaType.APPLICATION_JSON)
                .content(json(fulfil("DELIVERED"))))).andExpect(jsonPath("$.orderStatus").value("DELIVERED"))
                .andExpect(jsonPath("$.nextSteps.length()").value(0));
        mvc.perform(customer.auth(get("/api/orders/" + number))).andExpect(jsonPath("$.status").value("DELIVERED"))
                .andExpect(jsonPath("$.paymentStatus").value("PAID"));
    }

    @Test
    void cancelledOrdersDontCountAsSalesAndCantBeFulfilled() throws Exception {
        Session s = approvedSeller("cancel");
        long product = listedProduct(s, "Cancel Candle");
        Session customer = register(uniqueEmail("cancel-buyer"));
        addToCart(customer, product, 3);
        String number = placeCod(customer).path("orderNumber").asString();
        mvc.perform(customer.auth(post("/api/orders/" + number + "/cancel"))).andExpect(status().isOk());

        mvc.perform(s.auth(get("/api/seller/orders/" + number))).andExpect(jsonPath("$.fulfillmentStatus").value("CANCELLED"))
                .andExpect(jsonPath("$.nextSteps.length()").value(0));
        mvc.perform(s.auth(patch("/api/seller/orders/" + number + "/status").contentType(MediaType.APPLICATION_JSON)
                .content(json(fulfil("SHIPPED"))))).andExpect(status().isConflict());
        mvc.perform(s.auth(get("/api/seller/dashboard"))).andExpect(jsonPath("$.stats.orders").value(0))
                .andExpect(jsonPath("$.stats.grossSales").value(0.0))
                .andExpect(jsonPath("$.stats.cancelledOrders").value(1));
        assertThat(stockOf(product)).isEqualTo(12);
    }

    @Test
    void aSuspendedStoreCantUpdateOrders() throws Exception {
        Session s = approvedSeller("susp-order");
        long product = listedProduct(s, "Suspended Order Candle");
        Session customer = register(uniqueEmail("susp-buyer"));
        addToCart(customer, product, 1);
        String number = placeCod(customer).path("orderNumber").asString();
        mvc.perform(admin().auth(patch("/api/admin/sellers/" + s.userId() + "/suspend")
                .contentType(MediaType.APPLICATION_JSON).content(json(Map.of("reason", "Review.")))))
                .andExpect(status().isOk());
        mvc.perform(s.auth(get("/api/seller/orders/" + number))).andExpect(status().isOk());
        mvc.perform(s.auth(patch("/api/seller/orders/" + number + "/status").contentType(MediaType.APPLICATION_JSON)
                .content(json(fulfil("SHIPPED"))))).andExpect(status().isForbidden());
    }

    // ── Hardening ──────────────────────────────────────────

    @Test
    void noRequestFieldCanSetOwnershipRoleOrStatus() throws Exception {
        Session a = approvedSeller("fields-a");
        Session b = approvedSeller("fields-b");
        Map<String, Object> sneaky = productBody("Fields Candle", true);
        sneaky.putAll(Map.of("seller_id", b.userId(), "ownerId", b.userId(), "owner_id", b.userId(), "sellerId", b.userId(),
                "role", "ADMIN", "status", "APPROVED", "active", true, "id", 1));
        JsonNode created = body(mvc.perform(a.auth(postJson("/api/seller/products", sneaky)))
                .andExpect(status().isCreated()).andReturn());
        long id = created.path("id").asLong();
        assertThat(id).isNotEqualTo(1L);
        assertThat(created.path("status").asString()).isEqualTo("PENDING_APPROVAL");
        assertThat(jdbc.queryForObject("select seller_id from products where id = ?", Long.class, id)).isEqualTo(a.userId());
        // The same fields on an update change nothing either.
        mvc.perform(a.auth(put("/api/seller/products/" + id).contentType(MediaType.APPLICATION_JSON).content(json(sneaky))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING_APPROVAL"));
        assertThat(jdbc.queryForObject("select seller_id from products where id = ?", Long.class, id)).isEqualTo(a.userId());
        mvc.perform(a.auth(get("/api/auth/me"))).andExpect(jsonPath("$.role").value("SELLER"));

        // Store settings can't change the store's status, owner or web address.
        String slug = body(mvc.perform(a.auth(get("/api/seller/me"))).andReturn()).path("slug").asString();
        Map<String, Object> settings = application("Renamed Store " + UUID.randomUUID().toString().substring(0, 6));
        settings.putAll(Map.of("status", "SUSPENDED", "slug", "hijacked", "userId", b.userId(), "user_id", b.userId(),
                "role", "ADMIN"));
        mvc.perform(a.auth(put("/api/seller/profile").contentType(MediaType.APPLICATION_JSON).content(json(settings))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.slug").value(slug));
        assertThat(body(mvc.perform(b.auth(get("/api/seller/me"))).andReturn()).path("storeName").asString())
                .isNotEqualTo(settings.get("storeName"));

        // A seller application can't approve itself or ask for another role.
        Map<String, Object> app = application("Self Approved " + UUID.randomUUID().toString().substring(0, 6));
        app.putAll(Map.of("status", "APPROVED", "statusReason", "ok"));
        String email = uniqueEmail("self-approve");
        JsonNode reg = body(mvc.perform(postJson("/api/auth/register", Map.of("fullName", "Self", "email", email,
                "password", SELLER_PASSWORD, "role", "ADMIN", "seller", app))).andExpect(status().isOk()).andReturn());
        assertThat(reg.path("user").path("role").asString()).isEqualTo("SELLER");
        assertThat(reg.path("user").path("sellerStatus").asString()).isEqualTo("PENDING");
    }

    @Test
    void theListingRuleAllowsEveryUnlistedState() {
        try {
            // Every state is allowed while the product isn't listed; only "listed but not approved" is refused.
            for (String status : List.of("DRAFT", "PENDING_APPROVAL", "REJECTED", "ARCHIVED", "APPROVED")) {
                assertThat(jdbc.update("update products set active = false, status = ? where id = 1", status)).isEqualTo(1);
            }
            assertThat(jdbc.update("update products set active = true where id = 1")).isEqualTo(1);
            for (String status : List.of("DRAFT", "PENDING_APPROVAL", "REJECTED", "ARCHIVED")) {
                assertThatThrownBy(() -> jdbc.update("update products set status = ? where id = 1", status))
                        .as(status).isInstanceOf(DataAccessException.class);
            }
        } finally {
            jdbc.update("update products set status = 'APPROVED', active = true where id = 1");
        }
    }

    @Test
    void storeNamesAreUniqueInTheDatabaseToo() throws Exception {
        Session seller = pendingSeller("unique-name");
        String name = body(mvc.perform(seller.auth(get("/api/seller/me"))).andReturn()).path("storeName").asString();
        Long otherUser = register(uniqueEmail("unique-other")).userId();
        assertThatThrownBy(() -> jdbc.update("insert into seller_profiles (user_id, slug, store_name, business_category, "
                + "phone, address_line, city, state, pincode, status, version, created_at, updated_at) values "
                + "(?, ?, ?, 'gift sets', '+91 98765 43210', 'x', 'Pune', 'Maharashtra', '411001', 'PENDING', 0, "
                + "utc_timestamp(6), utc_timestamp(6))", otherUser, "dup-" + otherUser, name.toUpperCase()))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    void aSuspendedStoreCantChangeOrRemoveProducts() throws Exception {
        Session s = approvedSeller("frozen");
        long listed = listedProduct(s, "Frozen Candle");
        long draft = createProduct(s, "Frozen Draft", false);
        mvc.perform(admin().auth(patch("/api/admin/sellers/" + s.userId() + "/suspend")
                .contentType(MediaType.APPLICATION_JSON).content(json(Map.of("reason", "Review.")))))
                .andExpect(status().isOk());
        mvc.perform(s.auth(put("/api/seller/products/" + listed).contentType(MediaType.APPLICATION_JSON)
                .content(json(productBody("Frozen Candle", false))))).andExpect(status().isForbidden());
        mvc.perform(s.auth(post("/api/seller/products/" + draft + "/submit"))).andExpect(status().isForbidden());
        mvc.perform(s.auth(delete("/api/seller/products/" + listed))).andExpect(status().isForbidden());
        mvc.perform(s.auth(get("/api/seller/products/" + listed))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED")).andExpect(jsonPath("$.active").value(false));
        mvc.perform(s.auth(get("/api/seller/dashboard"))).andExpect(status().isOk());
    }

    @Test
    void onlyApprovedStoresHaveAPublicPage() throws Exception {
        Session pending = pendingSeller("hidden-pending");
        String pendingSlug = body(mvc.perform(pending.auth(get("/api/seller/me"))).andReturn()).path("slug").asString();
        mvc.perform(get("/api/stores/" + pendingSlug)).andExpect(status().isNotFound());
        mvc.perform(admin().auth(patch("/api/admin/sellers/" + pending.userId() + "/reject")
                .contentType(MediaType.APPLICATION_JSON).content(json(Map.of("reason", "Incomplete.")))))
                .andExpect(status().isOk());
        mvc.perform(get("/api/stores/" + pendingSlug)).andExpect(status().isNotFound());
        mvc.perform(get("/api/stores/no-such-store-anywhere")).andExpect(status().isNotFound());
        // Nothing of theirs is in the shop either.
        assertThat(body(mvc.perform(get("/api/products?store=" + pendingSlug)).andReturn()).path("totalElements").asInt())
                .isZero();
    }

    @Test
    void salesCountEachOrderOnceAndEveryUnit() throws Exception {
        Session s = approvedSeller("count");
        long candle = listedProduct(s, "Count Candle");
        long mug = listedProduct(s, "Count Mug");
        Session customer = register(uniqueEmail("count-buyer"));
        addToCart(customer, candle, 2);
        addToCart(customer, mug, 4);
        mvc.perform(customer.auth(postJson("/api/cart/items", Map.of("productId", candle, "quantity", 1,
                "customName", "Priya")))).andExpect(status().isOk()); // a second, personalised line of the same product
        placeCod(customer);
        mvc.perform(s.auth(get("/api/seller/analytics")))
                .andExpect(jsonPath("$.stats.orders").value(1))
                .andExpect(jsonPath("$.stats.unitsSold").value(7))
                .andExpect(jsonPath("$.stats.grossSales").value(3150.0))
                .andExpect(jsonPath("$.stats.averageOrderValue").value(3150.0))
                .andExpect(jsonPath("$.topProducts.length()").value(2))
                .andExpect(jsonPath("$.topProducts[0].productId").value(mug))
                .andExpect(jsonPath("$.topProducts[1].unitsSold").value(3));
    }

    @Test
    void twoSellersShippingOneOrderAtOnceBothCount() throws Exception {
        Session a = approvedSeller("race-a");
        Session b = approvedSeller("race-b");
        long pa = listedProduct(a, "Race Candle");
        long pb = listedProduct(b, "Race Mug");
        for (int round = 0; round < 3; round++) {
            Session customer = register(uniqueEmail("race-buyer"));
            addToCart(customer, pa, 1);
            addToCart(customer, pb, 1);
            String number = placeCod(customer).path("orderNumber").asString();
            List<Integer> codes = inParallel(
                    () -> mvc.perform(a.auth(patch("/api/seller/orders/" + number + "/status")
                            .contentType(MediaType.APPLICATION_JSON).content(json(fulfil("SHIPPED"))))).andReturn()
                            .getResponse().getStatus(),
                    () -> mvc.perform(b.auth(patch("/api/seller/orders/" + number + "/status")
                            .contentType(MediaType.APPLICATION_JSON).content(json(fulfil("SHIPPED"))))).andReturn()
                            .getResponse().getStatus());
            assertThat(codes).containsOnly(200);
            // Both parcels shipped, so the customer's order is shipped: neither update was lost.
            mvc.perform(customer.auth(get("/api/orders/" + number))).andExpect(jsonPath("$.status").value("SHIPPED"));
        }
    }

    @Test
    void aCancelRacingAShipmentLeavesAConsistentOrder() throws Exception {
        Session s = approvedSeller("race-cancel");
        long product = listedProduct(s, "Race Cancel Candle");
        for (int round = 0; round < 3; round++) {
            Session customer = register(uniqueEmail("race-cancel-buyer"));
            addToCart(customer, product, 1);
            String number = placeCod(customer).path("orderNumber").asString();
            inParallel(
                    () -> mvc.perform(customer.auth(post("/api/orders/" + number + "/cancel"))).andReturn()
                            .getResponse().getStatus(),
                    () -> mvc.perform(s.auth(patch("/api/seller/orders/" + number + "/status")
                            .contentType(MediaType.APPLICATION_JSON).content(json(fulfil("SHIPPED"))))).andReturn()
                            .getResponse().getStatus());
            JsonNode order = body(mvc.perform(customer.auth(get("/api/orders/" + number))).andReturn());
            String line = order.path("items").get(0).path("fulfillmentStatus").asString();
            // Either the cancel won (the line is cancelled) or the shipment did (the order isn't cancelled).
            if ("CANCELLED".equals(order.path("status").asString())) {
                assertThat(line).isEqualTo("CANCELLED");
            } else {
                assertThat(line).isEqualTo("SHIPPED");
                assertThat(order.path("status").asString()).isEqualTo("SHIPPED");
            }
        }
    }

    /** Runs the calls at the same moment on separate threads and returns their results in order. */
    @SafeVarargs
    private static List<Integer> inParallel(Callable<Integer>... calls) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(calls.length);
        try {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<Integer>> results = new java.util.ArrayList<>();
            for (Callable<Integer> call : calls) {
                results.add(pool.submit(() -> {
                    start.await();
                    return call.call();
                }));
            }
            start.countDown();
            List<Integer> out = new java.util.ArrayList<>();
            for (Future<Integer> f : results) {
                out.add(f.get());
            }
            return out;
        } finally {
            pool.shutdownNow();
        }
    }
}
