package com.giftgenius.order;

import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Seller sales figures, computed in the database from the seller's own order lines. "Counted" orders are the
 * confirmed ones: not waiting for online payment and not cancelled.
 */
public interface OrderItemRepository extends JpaRepository<OrderItem, Long> {

    /** One row: distinct orders, units sold, gross sales. */
    @Query("select count(distinct i.order.id), coalesce(sum(i.quantity), 0), coalesce(sum(i.lineTotal), 0) "
            + "from OrderItem i where i.sellerId = :sellerId and i.order.status not in :excluded "
            + "and i.fulfillmentStatus <> com.giftgenius.order.FulfillmentStatus.CANCELLED")
    List<Object[]> salesOf(@Param("sellerId") Long sellerId, @Param("excluded") Collection<OrderStatus> excluded);

    /** Rows of: seller id, distinct orders, gross sales; for a page of sellers at once. */
    @Query("select i.sellerId, count(distinct i.order.id), coalesce(sum(i.lineTotal), 0) from OrderItem i "
            + "where i.sellerId in :sellerIds and i.order.status not in :excluded "
            + "and i.fulfillmentStatus <> com.giftgenius.order.FulfillmentStatus.CANCELLED group by i.sellerId")
    List<Object[]> salesBySeller(@Param("sellerIds") Collection<Long> sellerIds,
            @Param("excluded") Collection<OrderStatus> excluded);

    /** Rows of: product id, product name, units sold, sales; best sellers first. */
    @Query("select i.productId, max(i.productName), sum(i.quantity), sum(i.lineTotal) from OrderItem i "
            + "where i.sellerId = :sellerId and i.order.status not in :excluded "
            + "and i.fulfillmentStatus <> com.giftgenius.order.FulfillmentStatus.CANCELLED "
            + "group by i.productId order by sum(i.quantity) desc, sum(i.lineTotal) desc")
    List<Object[]> topProducts(@Param("sellerId") Long sellerId, @Param("excluded") Collection<OrderStatus> excluded,
            Pageable pageable);

    @Query("select count(distinct i.order.id) from OrderItem i where i.sellerId = :sellerId "
            + "and i.fulfillmentStatus = com.giftgenius.order.FulfillmentStatus.CANCELLED")
    long cancelledOrders(@Param("sellerId") Long sellerId);

    /** Orders with a line the seller still has to pack or ship (confirmed orders only). */
    @Query("select count(distinct i.order.id) from OrderItem i where i.sellerId = :sellerId "
            + "and i.order.status not in :excluded and i.fulfillmentStatus in :open")
    long ordersToFulfil(@Param("sellerId") Long sellerId, @Param("excluded") Collection<OrderStatus> excluded,
            @Param("open") Collection<FulfillmentStatus> open);
}
