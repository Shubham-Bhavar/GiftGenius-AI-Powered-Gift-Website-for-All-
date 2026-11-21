package com.giftgenius.cart;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Which guest-cart merges a user has already had (GG-45), so that the same merge sent twice adds its lines once.
 * Written inside the merge's transaction: the receipt and the lines are saved together, or neither is.
 */
@Component
class CartMergeReceipts {

    private final JdbcTemplate jdbc;

    CartMergeReceipts(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Records a merge under {@code key}; false when that user already had a merge under it. A duplicate key fails
     * only this statement in MySQL, not the transaction; a plain insert is used because an
     * {@code ON DUPLICATE KEY} no-op reports one affected row with the driver's default settings.
     */
    boolean firstTime(Long userId, String key) {
        try {
            jdbc.update("INSERT INTO cart_merges (user_id, merge_key, created_at) VALUES (?, ?, UTC_TIMESTAMP(6))",
                    userId, key);
            return true;
        } catch (DuplicateKeyException alreadyMerged) {
            return false;
        }
    }
}
