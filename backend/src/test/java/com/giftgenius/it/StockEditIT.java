package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import tools.jackson.databind.JsonNode;

/**
 * GG-36: an edit form opened before some units sold must not give those units back when it is saved. The form sends
 * the stock it showed ({@code stockSeen}); only the change made in it is applied, to the stock as it is now.
 */
class StockEditIT extends AbstractIT {

    private static Map<String, Object> adminProduct(int stock) {
        return new HashMap<>(Map.of("name", "Stock Edit Candle " + UUID.randomUUID().toString().substring(0, 6),
                "category", "home decor", "description", "A soy candle.", "price", 350, "originalPrice", 450,
                "image", "https://example.com/candle.jpg", "stock", stock, "tags", List.of("candle"),
                "occasion", List.of("birthday")));
    }

    private long createAdminProduct(Session admin, Map<String, Object> body) throws Exception {
        return body(mvc.perform(admin.auth(postJson("/api/admin/products", body))).andExpect(status().isCreated())
                .andReturn()).path("id").asLong();
    }

    private MvcResult saveAdmin(Session admin, long id, Map<String, Object> body) throws Exception {
        return mvc.perform(admin.auth(put("/api/admin/products/" + id).contentType(MediaType.APPLICATION_JSON)
                .content(json(body)))).andReturn();
    }

    private void buy(long productId, int qty) throws Exception {
        Session s = register(uniqueEmail("stock-buyer"));
        addToCart(s, productId, qty);
        mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()), "deliveryType", "STANDARD",
                "paymentMethod", "COD"))).header("Idempotency-Key", UUID.randomUUID().toString()))
                .andExpect(status().isCreated());
    }

    @Test
    void aRestockSavedFromAFormOpenedBeforeASaleKeepsTheSale() throws Exception {
        Session admin = admin();
        Map<String, Object> form = adminProduct(50);
        long id = createAdminProduct(admin, form);

        buy(id, 2); // while the form is open: 48 left

        form.put("stock", 60); // the admin restocks by 10, from the 50 the form showed
        form.put("stockSeen", 50);
        MvcResult saved = saveAdmin(admin, id, form);
        assertThat(saved.getResponse().getStatus()).isEqualTo(200);
        assertThat(body(saved).path("stock").asInt()).as("the reply shows the stock as saved").isEqualTo(58);
        assertThat(stockOf(id)).isEqualTo(58);
    }

    @Test
    void withoutStockSeenTheEnteredStockIsTakenAsItStandsAsBefore() throws Exception {
        Session admin = admin();
        Map<String, Object> form = adminProduct(50);
        long id = createAdminProduct(admin, form);
        buy(id, 2);
        form.put("stock", 60);
        assertThat(saveAdmin(admin, id, form).getResponse().getStatus()).isEqualTo(200);
        assertThat(stockOf(id)).as("an older client keeps its old meaning").isEqualTo(60);
    }

    @Test
    void loweringTheStockBelowWhatIsLeftIsRefusedAndChangesNothing() throws Exception {
        Session admin = admin();
        Map<String, Object> form = adminProduct(5);
        long id = createAdminProduct(admin, form);
        buy(id, 4); // 1 left

        form.put("stock", 2); // the form showed 5 and the admin takes 3 away
        form.put("stockSeen", 5);
        form.put("price", 300);
        MvcResult refused = saveAdmin(admin, id, form);
        assertThat(refused.getResponse().getStatus()).isEqualTo(409);
        assertThat(body(refused).path("detail").asString()).contains("Only 1 left now");
        assertThat(stockOf(id)).isEqualTo(1);
        assertThat(body(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .get("/api/products/" + id)).andReturn()).path("price").asDouble())
                .as("nothing of the refused edit was saved").isEqualTo(350.0);
    }

    @Test
    void ordersAndAnEditAtTheSameMomentAddUp() throws Exception {
        Session admin = admin();
        Map<String, Object> form = adminProduct(40);
        long id = createAdminProduct(admin, form);
        int buyers = 6;
        List<Session> sessions = new ArrayList<>();
        for (int i = 0; i < buyers; i++) {
            Session s = register(uniqueEmail("stock-race"));
            addToCart(s, id, 1);
            sessions.add(s);
        }
        form.put("stock", 50); // +10 from the 40 the form showed
        form.put("stockSeen", 40);

        ExecutorService pool = Executors.newFixedThreadPool(buyers + 1);
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<Integer>> work = new ArrayList<>();
        for (Session s : sessions) {
            work.add(() -> {
                start.await();
                return mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()),
                        "deliveryType", "STANDARD", "paymentMethod", "COD")))
                        .header("Idempotency-Key", UUID.randomUUID().toString())).andReturn().getResponse().getStatus();
            });
        }
        work.add(() -> {
            start.await();
            return saveAdmin(admin, id, form).getResponse().getStatus();
        });
        List<Future<Integer>> results = new ArrayList<>();
        for (Callable<Integer> c : work) {
            results.add(pool.submit(c));
        }
        start.countDown();
        int sold = 0;
        for (int i = 0; i < results.size(); i++) {
            int code = results.get(i).get();
            if (i < buyers) {
                assertThat(code).as("order %s", i).isIn(201, 409);
                sold += code == 201 ? 1 : 0;
            } else {
                assertThat(code).as("the edit").isEqualTo(200);
            }
        }
        pool.shutdown();
        assertThat(sold).isEqualTo(buyers);
        assertThat(stockOf(id)).as("40 + 10 restocked - %s sold", sold).isEqualTo(40 + 10 - sold);
    }

    @Test
    void aSellersEditKeepsUnitsSoldWhileItsFormWasOpenToo() throws Exception {
        String email = uniqueEmail("stock-seller");
        Map<String, Object> application = new HashMap<>(Map.of("storeName", "Stock Store " + UUID.randomUUID()
                .toString().substring(0, 8), "description", "Handmade gifts from Pune.", "businessCategory",
                "home decor", "phone", "+91 98765 43210", "addressLine", "7 FC Road", "city", "Pune", "state",
                "Maharashtra", "pincode", "411004"));
        Session seller = session(mvc.perform(postJson("/api/auth/register", Map.of("fullName", "Sana Seller",
                "email", email, "password", "seller-password-1", "seller", application)))
                .andExpect(status().isOk()).andReturn(), email);
        mvc.perform(admin().auth(patch("/api/admin/sellers/" + seller.userId() + "/approve"))).andExpect(status().isOk());
        Map<String, Object> form = new HashMap<>(Map.of("name", "Seller Stock Candle",
                "description", "A hand-poured soy candle in a glass jar.", "category", "home decor", "price", 450,
                "stock", 20, "image", "https://img.example.com/candle.jpg", "occasion", List.of("birthday"),
                "tags", List.of("Handmade"), "submit", true));
        JsonNode created = body(mvc.perform(seller.auth(postJson("/api/seller/products", form)))
                .andExpect(status().isCreated()).andReturn());
        long id = created.path("id").asLong();
        mvc.perform(admin().auth(patch("/api/admin/products/" + id + "/approve"))).andExpect(status().isOk());

        buy(id, 3); // 17 left

        form.put("stock", 25); // +5 from the 20 the form showed
        form.put("stockSeen", 20);
        form.put("submit", false);
        mvc.perform(seller.auth(put("/api/seller/products/" + id).contentType(MediaType.APPLICATION_JSON)
                .content(json(form)))).andExpect(status().isOk()).andExpect(jsonPath("$.stock").value(22));
        assertThat(stockOf(id)).isEqualTo(22);
    }
}
