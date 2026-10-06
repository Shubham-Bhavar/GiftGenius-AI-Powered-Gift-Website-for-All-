package com.giftgenius.admin;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.giftgenius.admin.AdminStatsDtos.LowStock;
import com.giftgenius.admin.AdminStatsDtos.Stats;
import com.giftgenius.catalog.ProductRepository;
import com.giftgenius.catalog.ProductStatus;
import com.giftgenius.order.OrderRepository;
import com.giftgenius.order.OrderStatus;
import com.giftgenius.seller.SellerProfileRepository;
import com.giftgenius.seller.SellerStatus;

/** The Store Admin dashboard's numbers: recent orders and revenue, work waiting, and low stock. */
@Service
public class AdminStatsService {

    private static final int RECENT_DAYS = 30;
    /** Products with fewer units than this are listed as low stock. */
    private static final int LOW_STOCK_BELOW = 10;

    private final OrderRepository orders;
    private final ProductRepository products;
    private final SellerProfileRepository sellers;

    public AdminStatsService(OrderRepository orders, ProductRepository products, SellerProfileRepository sellers) {
        this.orders = orders;
        this.products = products;
        this.sellers = sellers;
    }

    @Transactional(readOnly = true)
    public Stats stats() {
        Instant since = Instant.now().minus(RECENT_DAYS, ChronoUnit.DAYS);
        List<LowStock> low = products.findByActiveTrueAndStockLessThanOrderByStockAsc(LOW_STOCK_BELOW).stream()
                .map(p -> new LowStock(p.getId(), p.getName(), p.getStock())).toList();
        return new Stats(orders.countSince(since), orders.revenueSince(since),
                orders.countByStatus(OrderStatus.CONFIRMED) + orders.countByStatus(OrderStatus.PACKED),
                orders.countByStatus(OrderStatus.PENDING_PAYMENT), low, sellers.countByStatus(SellerStatus.PENDING),
                products.countByStatus(ProductStatus.PENDING_APPROVAL));
    }
}
