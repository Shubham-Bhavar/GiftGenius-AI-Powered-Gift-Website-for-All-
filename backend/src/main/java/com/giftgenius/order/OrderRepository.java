package com.giftgenius.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderRepository extends JpaRepository<Order, Long> {

    Optional<Order> findByOrderNumber(String orderNumber);

    Optional<Order> findByOrderNumberAndUserId(String orderNumber, Long userId);

    Optional<Order> findByUserIdAndIdempotencyKey(Long userId, String idempotencyKey);

    Optional<Order> findByRazorpayOrderId(String razorpayOrderId);

    Page<Order> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);

    Page<Order> findByStatusInOrderByCreatedAtDesc(Collection<OrderStatus> statuses, Pageable pageable);

    Page<Order> findAllByOrderByCreatedAtDesc(Pageable pageable);

    List<Order> findTop100ByStatusAndCreatedAtBefore(OrderStatus status, Instant cutoff);

    boolean existsByOrderNumber(String orderNumber);

    long countByStatus(OrderStatus status);

    long countByUserIdAndStatus(Long userId, OrderStatus status);

    long countByUserIdAndCouponCodeAndStatusNot(Long userId, String couponCode, OrderStatus status);

    /**
     * Orders with at least one line sold by this seller (optionally in one fulfilment state), newest first.
     * Orders still waiting for online payment aren't shown to sellers: there is nothing to fulfil yet.
     */
    @Query(value = "select o from Order o where o.status <> com.giftgenius.order.OrderStatus.PENDING_PAYMENT "
            + "and exists (select 1 from OrderItem i where i.order = o and i.sellerId = :sellerId "
            + "and (:fulfillment is null or i.fulfillmentStatus = :fulfillment)) order by o.createdAt desc",
            countQuery = "select count(o) from Order o where o.status <> com.giftgenius.order.OrderStatus.PENDING_PAYMENT "
            + "and exists (select 1 from OrderItem i where i.order = o and i.sellerId = :sellerId "
            + "and (:fulfillment is null or i.fulfillmentStatus = :fulfillment))")
    Page<Order> findForSeller(@Param("sellerId") Long sellerId, @Param("fulfillment") FulfillmentStatus fulfillment,
            Pageable pageable);

    /** The order only if this seller has a line in it (and it isn't waiting for payment). */
    @Query("select o from Order o where o.orderNumber = :orderNumber "
            + "and o.status <> com.giftgenius.order.OrderStatus.PENDING_PAYMENT "
            + "and exists (select 1 from OrderItem i where i.order = o and i.sellerId = :sellerId)")
    Optional<Order> findForSeller(@Param("orderNumber") String orderNumber, @Param("sellerId") Long sellerId);

    @Query("select coalesce(sum(o.total), 0) from Order o where o.paymentStatus = com.giftgenius.order.PaymentStatus.PAID "
            + "and o.createdAt >= :since")
    BigDecimal revenueSince(@Param("since") Instant since);

    @Query("select count(o) from Order o where o.createdAt >= :since and o.status <> com.giftgenius.order.OrderStatus.CANCELLED")
    long countSince(@Param("since") Instant since);
}
