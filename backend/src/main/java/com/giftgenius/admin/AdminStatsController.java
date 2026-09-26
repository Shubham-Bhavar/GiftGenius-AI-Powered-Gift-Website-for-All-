package com.giftgenius.admin;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.catalog.ProductRepository;
import com.giftgenius.order.OrderRepository;
import com.giftgenius.order.OrderStatus;

@RestController
@RequestMapping("/api/admin/stats")
public class AdminStatsController {

    public record LowStock(Long id, String name, int stock) {
    }

    public record Stats(long ordersLast30Days, BigDecimal paidRevenueLast30Days, long awaitingDispatch,
            long awaitingPayment, List<LowStock> lowStock) {
    }

    private final OrderRepository orders;
    private final ProductRepository products;

    public AdminStatsController(OrderRepository orders, ProductRepository products) {
        this.orders = orders;
        this.products = products;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public Stats stats() {
        Instant since = Instant.now().minus(30, ChronoUnit.DAYS);
        List<LowStock> low = products.findByActiveTrueAndStockLessThanOrderByStockAsc(10).stream()
                .map(p -> new LowStock(p.getId(), p.getName(), p.getStock())).toList();
        return new Stats(orders.countSince(since), orders.revenueSince(since),
                orders.countByStatus(OrderStatus.CONFIRMED) + orders.countByStatus(OrderStatus.PACKED),
                orders.countByStatus(OrderStatus.PENDING_PAYMENT), low);
    }
}
