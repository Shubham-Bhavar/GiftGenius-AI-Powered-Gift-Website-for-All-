package com.giftgenius.order.service;

import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.giftgenius.config.AppProperties;
import com.giftgenius.notify.EmailKind;
import com.giftgenius.notify.EmailOutbox;
import com.giftgenius.seller.model.SellerProfile;
import com.giftgenius.seller.repository.SellerProfileRepository;
import com.giftgenius.order.model.FulfillmentStatus;
import com.giftgenius.order.model.Order;
import com.giftgenius.order.model.OrderItem;
import com.giftgenius.order.model.OrderStatus;
import com.giftgenius.order.model.PaymentMethod;

/**
 * Every email about an order: to the customer, and to the sellers whose products are in it. Each is queued in the
 * email outbox inside the caller's transaction, under a key naming the order, the event and the recipient, so the
 * same email is never queued twice (see {@link EmailOutbox}).
 *
 * <p>An email whose content can't be built (a bug, or data the template doesn't expect) is logged, counted as a
 * {@code content} queue failure and skipped: it never fails the order it's about. The seller lookup is a database
 * query, and a database error there still fails the transaction, as any database error would.
 */
@Component
class OrderNotifier {

    private static final Logger log = LoggerFactory.getLogger(OrderNotifier.class);

    /** The customer's email for an order event: confirmed, or a status it reached. */
    static final String CONFIRMED = "confirmed";

    private final EmailOutbox outbox;
    private final SellerProfileRepository sellers;
    private final String publicUrl;

    OrderNotifier(EmailOutbox outbox, SellerProfileRepository sellers, AppProperties properties) {
        this.outbox = outbox;
        this.sellers = sellers;
        String url = properties.publicUrl();
        this.publicUrl = url != null && url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    static String status(OrderStatus status) {
        return "status:" + status.name();
    }

    /**
     * A headline, the order's lines and total, and the tracking link. {@code event} is {@link #CONFIRMED} or
     * {@link #status(OrderStatus)}: one email per order and event.
     */
    void customer(Order o, String event, String subject, String headline) {
        EmailKind kind = CONFIRMED.equals(event) ? EmailKind.ORDER_CONFIRMED : EmailKind.ORDER_STATUS;
        try {
            enqueueCustomer(o, event, kind, subject, headline);
        } catch (RuntimeException e) {
            contentFailed(o, kind, e);
        }
    }

    private void enqueueCustomer(Order o, String event, EmailKind kind, String subject, String headline) {
        StringBuilder body = new StringBuilder();
        body.append("Hi ").append(o.getShipping().firstName()).append(",\n\n").append(headline).append("\n\n");
        body.append("Order ").append(o.getOrderNumber()).append('\n');
        for (OrderItem i : o.getItems()) {
            body.append("  • ").append(i.getProductName()).append(" × ").append(i.getQuantity()).append('\n');
        }
        body.append("Total: ₹").append(o.getTotal().setScale(2, RoundingMode.HALF_UP))
                .append(o.getPaymentMethod() == PaymentMethod.COD ? " (cash on delivery)" : "").append("\n\n");
        body.append("Track your order: ").append(publicUrl).append("/track?order=").append(o.getOrderNumber())
                .append("\n\n— GiftGenius\n");
        outbox.enqueue("order:" + o.getId() + ":" + event + ":customer", kind, o.getId(), o.getShipping().getEmail(),
                subject, body.toString());
    }

    /** Emails each seller with lines in a newly confirmed order: what to send, not who the customer is. */
    void sellers(Order o) {
        Map<Long, List<OrderItem>> bySeller;
        try {
            bySeller = o.getItems().stream().filter(i -> i.getSellerId() != null)
                    .collect(Collectors.groupingBy(OrderItem::getSellerId, LinkedHashMap::new, Collectors.toList()));
        } catch (RuntimeException e) {
            contentFailed(o, EmailKind.ORDER_NEW_FOR_SELLER, e);
            return;
        }
        if (bySeller.isEmpty()) {
            return;
        }
        for (SellerProfile seller : sellers.findAllById(bySeller.keySet())) {
            // One seller's email failing to build doesn't stop the others'.
            try {
                enqueueSeller(o, seller, bySeller.get(seller.getUserId()));
            } catch (RuntimeException e) {
                contentFailed(o, EmailKind.ORDER_NEW_FOR_SELLER, e);
            }
        }
    }

    private void enqueueSeller(Order o, SellerProfile seller, List<OrderItem> lines) {
        StringBuilder body = new StringBuilder();
        body.append("Hi ").append(seller.getStoreName()).append(",\n\nYou have a new order to fulfil: ")
                .append(o.getOrderNumber()).append("\n\n");
        for (OrderItem i : lines) {
            body.append("  • ").append(i.getProductName()).append(" × ").append(i.getQuantity()).append('\n');
        }
        body.append("\nDelivery details and status updates: ").append(publicUrl).append("/seller/orders/")
                .append(o.getOrderNumber()).append("\n\n— GiftGenius Seller Center\n");
        outbox.enqueue("order:" + o.getId() + ":confirmed:seller:" + seller.getUserId(),
                EmailKind.ORDER_NEW_FOR_SELLER, o.getId(), seller.getUser().getEmail(),
                "New GiftGenius order " + o.getOrderNumber(), body.toString());
    }

    /** "Part of your order is on its way / has been delivered", when a seller ships or delivers their lines. */
    void partialShipment(Order o, SellerProfile seller, List<OrderItem> mine, FulfillmentStatus step, String note) {
        try {
            enqueuePartialShipment(o, seller, mine, step, note);
        } catch (RuntimeException e) {
            contentFailed(o, EmailKind.ORDER_PART_SHIPPED, e);
        }
    }

    private void enqueuePartialShipment(Order o, SellerProfile seller, List<OrderItem> mine, FulfillmentStatus step,
            String note) {
        StringBuilder body = new StringBuilder();
        body.append("Hi ").append(o.getShipping().firstName()).append(",\n\n")
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
        outbox.enqueue("order:" + o.getId() + ":seller:" + seller.getUserId() + ":" + step.name() + ":customer",
                EmailKind.ORDER_PART_SHIPPED, o.getId(), o.getShipping().getEmail(),
                "Update on your GiftGenius order " + o.getOrderNumber(), body.toString());
    }

    /** Logged with the order number and the error's type, and counted; the order goes ahead. */
    private void contentFailed(Order o, EmailKind kind, RuntimeException e) {
        log.error("Email {} for order {} not queued: its content couldn't be built ({})", kind,
                o == null ? null : o.getOrderNumber(), e.getClass().getSimpleName(), e);
        outbox.countFailure(EmailOutbox.Failure.CONTENT);
    }
}
