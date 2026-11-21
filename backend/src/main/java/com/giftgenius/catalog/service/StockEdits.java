package com.giftgenius.catalog.service;

import org.springframework.stereotype.Component;

import com.giftgenius.catalog.model.Product;
import com.giftgenius.common.ApiException;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;

/**
 * The stock a product edit leaves (GG-36). An edit form shows the stock as it was when the form was opened; orders
 * placed while it is open reserve stock in the meantime. Writing the form's number back as it stands would quietly
 * give those units back. So when the form says which stock it started from ({@code stockSeen}), only the change made
 * in it is applied, to the stock as it is now, read under a write lock:
 * <pre>new stock = stock now + (entered - stockSeen)</pre>
 * A restock from 50 to 60 while 2 were sold leaves 58; lowering it below what is left is refused. Without
 * {@code stockSeen} (an older client) the entered number is taken as it stands, as before.
 *
 * <p>Call it after any lock the edit takes on the store's row: everywhere else the store is locked before its
 * products, and taking them in the other order could deadlock.
 */
@Component
public class StockEdits {

    @PersistenceContext
    private EntityManager em;

    /**
     * The stock to save for {@code p}. With {@code seen}, {@code p} is refreshed from the database under a write lock
     * (held until the transaction ends, so no order can reserve in between) before the change is applied.
     */
    public int resolve(Product p, int entered, Integer seen, int max) {
        if (seen == null || p.getId() == null) {
            return entered;
        }
        em.refresh(p, LockModeType.PESSIMISTIC_WRITE);
        long now = p.getStock();
        long result = now + ((long) entered - seen);
        if (result < 0) {
            throw ApiException.conflict("Only " + now + " left now: some sold while you were editing. "
                    + "Reload the product and set the stock again.");
        }
        if (result > max) {
            throw ApiException.badRequest("Stock can be at most " + max + ".");
        }
        return (int) result;
    }
}
