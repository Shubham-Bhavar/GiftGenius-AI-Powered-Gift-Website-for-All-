package com.giftgenius.order;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.giftgenius.common.ApiException;
import com.giftgenius.common.PageResponse;
import com.giftgenius.notify.Mailer;
import com.giftgenius.order.SellerOrderDtos.FulfillmentUpdateRequest;
import com.giftgenius.order.SellerOrderDtos.SellerOrderDto;
import com.giftgenius.order.SellerOrderDtos.SellerOrderItem;
import com.giftgenius.order.SellerOrderDtos.SellerOrderSummary;
import com.giftgenius.order.SellerOrderDtos.SellerShipping;
import com.giftgenius.seller.SellerProfile;
import com.giftgenius.seller.SellerProfileRepository;

/**
 * Orders as a seller sees them. Every query is scoped to the seller's id in the database, and every view
 * holds only that seller's lines: another seller's products, prices and progress never leave the server.
 */
@Service
public class SellerOrderService {

    /** Orders that don't count towards sales: not yet paid for online, or cancelled. */
    public static final Set<OrderStatus> NOT_COUNTED = EnumSet.of(OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED);
    private static final Set<FulfillmentStatus> OPEN = EnumSet.of(FulfillmentStatus.NEW, FulfillmentStatus.PACKED);

    private final OrderRepository orders;
    private final OrderItemRepository items;
    private final SellerProfileRepository sellers;
    private final OrderService orderService;
    private final Mailer mailer;

    public SellerOrderService(OrderRepository orders, OrderItemRepository items, SellerProfileRepository sellers,
            OrderService orderService, Mailer mailer) {
        this.orders = orders;
        this.items = items;
        this.sellers = sellers;
        this.orderService = orderService;
        this.mailer = mailer;
    }

    @Transactional(readOnly = true)
    public PageResponse<SellerOrderSummary> list(Long sellerId, FulfillmentStatus status, int page, int size) {
        PageRequest pr = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 50));
        return PageResponse.of(orders.findForSeller(sellerId, status, pr).map(o -> summary(o, sellerId)));
    }

    @Transactional(readOnly = true)
    public List<SellerOrderSummary> recent(Long sellerId, int limit) {
        return orders.findForSeller(sellerId, null, PageRequest.of(0, limit)).map(o -> summary(o, sellerId)).getContent();
    }

    @Transactional(readOnly = true)
    public SellerOrderDto get(Long sellerId, String orderNumber) {
        return toDto(own(sellerId, orderNumber), sellerId);
    }

    /**
     * Moves all of this seller's (not cancelled) lines in the order to the next step. Only an approved store can
     * do this; the lines of other sellers and GiftGenius are never touched.
     *
     * <p>The order row is locked first, so two sellers shipping their parts of one order at the same time (or a
     * seller shipping while the customer cancels) are applied one after the other, each seeing the other's result.
     */
    @Transactional
    public SellerOrderDto updateFulfilment(Long sellerId, String orderNumber, FulfillmentUpdateRequest req) {
        Order o = orders.lockForSeller(orderNumber, sellerId)
                .orElseThrow(() -> ApiException.notFound("Order not found."));
        SellerProfile seller = sellers.findById(sellerId)
                .orElseThrow(() -> ApiException.forbidden("Set up your store first."));
        if (!seller.canSell()) {
            throw ApiException.forbidden("Your store isn't active, so its orders are handled by GiftGenius for now.");
        }
        if (o.getStatus() == OrderStatus.CANCELLED) {
            throw ApiException.conflict("This order was cancelled, so there's nothing to send.");
        }
        List<OrderItem> mine = liveLines(o, sellerId);
        if (mine.isEmpty()) {
            throw ApiException.conflict("Your part of this order was cancelled.");
        }
        FulfillmentStatus current = slowest(mine);
        FulfillmentStatus next = req.status();
        if (!current.canMoveTo(next)) {
            throw ApiException.conflict("Can't move your part of this order from " + current + " to " + next + ".");
        }
        String note = StringUtils.hasText(req.note()) ? req.note().trim() : null;
        mine.forEach(i -> i.setFulfillment(next, note));

        OrderStatus before = o.getStatus();
        orderService.rollUpFulfilment(o, note);
        OrderStatus announcedAs = next == FulfillmentStatus.DELIVERED ? OrderStatus.DELIVERED : OrderStatus.SHIPPED;
        boolean announced = o.getStatus() != before && o.getStatus() == announcedAs;
        if (next.hasShipped() && !announced) {
            // The order as a whole hasn't reached this step (other parcels are still to come): tell the customer
            // about this parcel. When it has, the order update email already said so.
            notifyPartial(o, seller, mine, next, note);
        }
        return toDto(o, sellerId);
    }

    private Order own(Long sellerId, String orderNumber) {
        return orders.findForSeller(orderNumber, sellerId)
                .orElseThrow(() -> ApiException.notFound("Order not found."));
    }

    private static List<OrderItem> lines(Order o, Long sellerId) {
        return o.getItems().stream().filter(i -> i.isSoldBy(sellerId)).toList();
    }

    private static List<OrderItem> liveLines(Order o, Long sellerId) {
        return lines(o, sellerId).stream().filter(i -> i.getFulfillmentStatus() != FulfillmentStatus.CANCELLED).toList();
    }

    /** The seller's progress on the order: their least advanced live line, or CANCELLED if all were cancelled. */
    private static FulfillmentStatus slowest(List<OrderItem> mine) {
        return mine.stream().map(OrderItem::getFulfillmentStatus).filter(f -> f != FulfillmentStatus.CANCELLED)
                .min(Comparator.naturalOrder()).orElse(FulfillmentStatus.CANCELLED);
    }

    private static BigDecimal total(List<OrderItem> mine) {
        return mine.stream().filter(i -> i.getFulfillmentStatus() != FulfillmentStatus.CANCELLED)
                .map(OrderItem::getLineTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    static SellerOrderSummary summary(Order o, Long sellerId) {
        List<OrderItem> mine = lines(o, sellerId);
        OrderItem first = mine.get(0);
        return new SellerOrderSummary(o.getOrderNumber(), o.getStatus(), slowest(mine),
                mine.stream().mapToInt(OrderItem::getQuantity).sum(), mine.size(), total(mine), first.getProductName(),
                first.getImageUrl(), o.getShipping().getCity(), o.getCreatedAt());
    }

    private static SellerOrderDto toDto(Order o, Long sellerId) {
        List<OrderItem> mine = lines(o, sellerId);
        FulfillmentStatus progress = slowest(mine);
        ShippingAddress s = o.getShipping();
        List<SellerOrderItem> items = mine.stream().map(i -> new SellerOrderItem(i.getProductId(), i.getProductName(),
                i.getImageUrl(), i.getUnitPrice(), i.getQuantity(), i.getLineTotal(), i.getCustomName(),
                i.getCustomMessage(), i.getFulfillmentStatus(), i.getFulfillmentNote(), i.getFulfillmentUpdatedAt()))
                .toList();
        List<FulfillmentStatus> next = o.getStatus() == OrderStatus.CANCELLED ? List.of() : progress.nextSteps();
        return new SellerOrderDto(o.getOrderNumber(), o.getStatus(), o.getPaymentMethod(), o.getDeliveryType(),
                progress, next, total(mine),
                new SellerShipping(s.getFullName(), s.getPhone(), s.getAddressLine(), s.getCity(), s.getState(),
                        s.getPincode()),
                items, o.getCreatedAt());
    }

    private void notifyPartial(Order o, SellerProfile seller, List<OrderItem> mine, FulfillmentStatus step, String note) {
        StringBuilder body = new StringBuilder();
        body.append("Hi ").append(o.getShipping().getFullName().trim().split("\\s+")[0]).append(",\n\n")
                .append(step == FulfillmentStatus.DELIVERED ? "Part of your order has been delivered"
                        : "Part of your order is on its way")
                .append(", sent by ").append(seller.getStoreName()).append(":\n\n");
        for (OrderItem i : mine) {
            body.append("  • ").append(i.getProductName()).append(" × ").append(i.getQuantity()).append('\n');
        }
        if (note != null) {
            body.append('\n').append(note).append('\n');
        }
        body.append("\nOrder ").append(o.getOrderNumber()).append("\n\n— GiftGenius\n");
        mailer.send(o.getShipping().getEmail(), "Update on your GiftGenius order " + o.getOrderNumber(), body.toString());
    }

    // ── Sales figures (computed in the database from the seller's own lines) ──

    /** Confirmed, not cancelled orders: count, units and gross sales; plus cancelled and still-to-send counts. */
    public record Sales(long orders, long units, BigDecimal gross, long cancelledOrders, long ordersToFulfil) {
    }

    public record SellerTotals(long orders, BigDecimal gross) {
    }

    public record ProductSales(Long productId, String name, long units, BigDecimal sales) {
    }

    @Transactional(readOnly = true)
    public Sales sales(Long sellerId) {
        Object[] row = items.salesOf(sellerId, NOT_COUNTED).get(0);
        return new Sales(((Number) row[0]).longValue(), ((Number) row[1]).longValue(), (BigDecimal) row[2],
                items.cancelledOrders(sellerId), items.ordersToFulfil(sellerId, NOT_COUNTED, OPEN));
    }

    @Transactional(readOnly = true)
    public Map<Long, SellerTotals> totalsBySeller(Collection<Long> sellerIds) {
        if (sellerIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, SellerTotals> out = new HashMap<>();
        for (Object[] row : items.salesBySeller(sellerIds, NOT_COUNTED)) {
            out.put((Long) row[0], new SellerTotals(((Number) row[1]).longValue(), (BigDecimal) row[2]));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<ProductSales> topProducts(Long sellerId, int limit) {
        return items.topProducts(sellerId, NOT_COUNTED, PageRequest.of(0, limit)).stream()
                .map(r -> new ProductSales((Long) r[0], (String) r[1], ((Number) r[2]).longValue(), (BigDecimal) r[3]))
                .toList();
    }
}
