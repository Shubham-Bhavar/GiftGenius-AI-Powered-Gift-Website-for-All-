package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;

/** Subscribing is idempotent even when the same email is sent several times at the same moment. */
class NewsletterConcurrencyIT extends AbstractIT {

    @Test
    void theSameEmailSubscribedAtOnceIsStoredOnceAndNeverAnError() throws Exception {
        for (int round = 0; round < 3; round++) {
            String email = uniqueEmail("news-race-" + round);
            int threads = 6;
            ExecutorService pool = Executors.newFixedThreadPool(threads);
            CountDownLatch start = new CountDownLatch(1);
            try {
                List<Future<Integer>> codes = new ArrayList<>();
                for (int i = 0; i < threads; i++) {
                    Callable<Integer> subscribe = () -> {
                        start.await();
                        return mvc.perform(postJson("/api/newsletter/subscribe", Map.of("email", email)))
                                .andReturn().getResponse().getStatus();
                    };
                    codes.add(pool.submit(subscribe));
                }
                start.countDown();
                for (Future<Integer> code : codes) {
                    assertThat(code.get()).as("every request succeeds").isEqualTo(200);
                }
            } finally {
                pool.shutdownNow();
            }
            assertThat(db.queryForObject("SELECT COUNT(*) FROM newsletter_subscribers WHERE email = ?", Integer.class,
                    email.toLowerCase())).isEqualTo(1);
        }
    }
}
