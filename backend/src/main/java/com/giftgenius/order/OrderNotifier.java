package com.giftgenius.order;

import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.giftgenius.config.AppProperties;
import com.giftgenius.notify.Mailer;
import com.giftgenius.seller.SellerProfile;
import com.giftgenius.seller.SellerProfileRepository;

/** Every email about an order: to the customer, and to the sellers whose products are in it. */
@Component
class OrderNotifier {

    private final Mailer mailer;
    private final SellerProfileRepository sellers;
    private final String publicUrl;

    OrderNotifier(Mailer mailer, SellerProfileRepository sellers, AppProperties properties) {
        this.mailer = mailer;
        this.sellers = sellers;
        String url = properties.publicUrl();
        this.publicUrl = url != null && url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    /** A headline, the order's lines and total, and the tracking link. */
    void customer(Order o, String subject, String headline) {
        StringBuilder body = new StringBuilder();
        body.append("Hi ").append(OrderMapper.firstName(o)).append(",\n\n").append(headline).append("\n\n");
        body.append("Order ").append(o.getOrderNumber()).append('\n');
        for (OrderItem i : o.getItems()) {
            body.append("  • ").append(i.getProductName()).append(" × ").append(i.getQuantity()).append('\n');
        }
        body.append("Total: ₹").append(o.getTotal().setScale(2, RoundingMode.HALF_UP))
                .append(o.getPaymentMethod() == PaymentMethod.COD ? " (cash on delivery)" : "").append("\n\n");
        body.append("Track your order: ").append(publicUrl).append("/track?order=").append(o.getOrderNumber())
                .append("\n\n— GiftGenius\n");
        mailer.send(o.getShipping().getEmail(), subject, body.toString());
    }

    /** Emails each seller with lines in a newly confirmed order: what to send, not who the customer is. */
    void sellers(Order o) {
        Map<Long, List<OrderItem>> bySeller = o.getItems().stream().filter(i -> i.getSellerId() != null)
                .collect(Collectors.groupingBy(OrderItem::getSellerId, LinkedHashMap::new, Collectors.toList()));
        if (bySeller.isEmpty()) {
            return;
        }
        for (SellerProfile seller : sellers.findAllById(bySeller.keySet())) {
            StringBuilder body = new StringBuilder();
            body.append("Hi ").append(seller.getStoreName()).append(",\n\nYou have a new order to fulfil: ")
                    .append(o.getOrderNumber()).append("\n\n");
            for (OrderItem i : bySeller.get(seller.getUserId())) {
                body.append("  • ").append(i.getProductName()).append(" × ").append(i.getQuantity()).append('\n');
            }
            body.append("\nDelivery details and status updates: ").append(publicUrl).append("/seller/orders/")
                    .append(o.getOrderNumber()).append("\n\n— GiftGenius Seller Center\n");
            mailer.send(seller.getUser().getEmail(), "New GiftGenius order " + o.getOrderNumber(), body.toString());
        }
    }

    /** "Part of your order is on its way / has been delivered", when a seller ships or delivers their lines. */
    void partialShipment(Order o, SellerProfile seller, List<OrderItem> mine, FulfillmentStatus step, String note) {
        StringBuilder body = new StringBuilder();
        body.append("Hi ").append(OrderMapper.firstName(o)).append(",\n\n")
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
}
