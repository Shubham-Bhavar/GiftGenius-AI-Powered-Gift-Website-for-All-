package com.giftgenius.order.service;

import java.time.Instant;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.giftgenius.config.AppProperties;
import com.giftgenius.order.model.Order;
import com.giftgenius.order.repository.OrderRepository;
import com.giftgenius.order.model.OrderStatus;

/** Releases stock held by online orders whose payment never completed. */
@Component
public class PendingOrderReaper {

    private final OrderRepository orders;
    private final OrderService service;
    private final AppProperties.Orders props;

    public PendingOrderReaper(OrderRepository orders, OrderService service, AppProperties properties) {
        this.orders = orders;
        this.service = service;
        this.props = properties.orders();
    }

    @Scheduled(fixedDelay = 300_000, initialDelay = 60_000)
    public void expireUnpaidOrders() {
        Instant cutoff = Instant.now().minus(props.pendingPaymentTtl());
        for (Order o : orders.findTop100ByStatusAndCreatedAtBefore(OrderStatus.PENDING_PAYMENT, cutoff)) {
            service.expireIfStillPending(o.getId());
        }
    }
}
