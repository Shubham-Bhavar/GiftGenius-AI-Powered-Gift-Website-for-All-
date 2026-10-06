package com.giftgenius.admin;

import java.math.BigDecimal;
import java.util.List;

/** What the Store Admin dashboard shows. */
public final class AdminStatsDtos {

    private AdminStatsDtos() {
    }

    public record LowStock(Long id, String name, int stock) {
    }

    public record Stats(long ordersLast30Days, BigDecimal paidRevenueLast30Days, long awaitingDispatch,
            long awaitingPayment, List<LowStock> lowStock, long sellersAwaitingReview, long productsAwaitingApproval) {
    }
}
