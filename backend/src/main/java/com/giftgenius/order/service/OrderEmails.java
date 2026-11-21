package com.giftgenius.order.service;

import static com.giftgenius.notify.EmailLayout.button;
import static com.giftgenius.notify.EmailLayout.details;
import static com.giftgenius.notify.EmailLayout.document;
import static com.giftgenius.notify.EmailLayout.heading;
import static com.giftgenius.notify.EmailLayout.lines;
import static com.giftgenius.notify.EmailLayout.note;
import static com.giftgenius.notify.EmailLayout.paragraph;
import static com.giftgenius.notify.EmailLayout.section;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.util.StringUtils;

import com.giftgenius.order.model.FulfillmentStatus;
import com.giftgenius.order.model.Order;
import com.giftgenius.order.model.OrderItem;
import com.giftgenius.order.model.OrderStatus;
import com.giftgenius.order.model.PaymentMethod;
import com.giftgenius.order.model.PaymentStatus;
import com.giftgenius.order.model.ShippingAddress;
import com.giftgenius.pricing.model.DeliveryType;

/**
 * What each order email says, as plain text and as branded HTML with the same content.
 *
 * <p>Who is told what:
 * <ul>
 *   <li><b>The customer</b> gets their own order: items, amounts, status, times, and (in the confirmation) where it
 *       is going.</li>
 *   <li><b>A seller</b> gets only their own lines and what they need to start: never the customer's name, email,
 *       phone or address, and never the personalisation text. Delivery details are in the Seller Center, behind
 *       their sign-in.</li>
 *   <li><b>The owner</b> gets the order with the customer's name, email and city: enough to act on, without the
 *       phone number or street address.</li>
 * </ul>
 * Every value from people (names, product and store names, notes) is escaped in the HTML.
 */
final class OrderEmails {

    /** One email's subject and its two bodies. */
    record Content(String subject, String text, String html) {
    }

    private static final Locale INDIA = Locale.forLanguageTag("en-IN");

    private final String publicUrl;
    private final ZoneId zone;
    private final DateTimeFormatter when;

    OrderEmails(String publicUrl, ZoneId zone) {
        this.publicUrl = publicUrl == null ? "" : publicUrl;
        this.zone = zone;
        this.when = DateTimeFormatter.ofPattern("d MMM uuuu, h:mm a z", INDIA).withZone(zone);
    }

    // ── To the customer ──

    /**
     * The confirmation, or a status update. {@code confirmation} adds the price breakdown and the delivery address;
     * a status update shows the new status and when it changed ({@code now}).
     */
    Content customer(Order o, String subject, String headline, boolean confirmation, Instant now) {
        ShippingAddress to = o.getShipping();
        String track = publicUrl + "/track?order=" + encode(o.getOrderNumber());

        List<String[]> facts = new ArrayList<>();
        facts.add(row("Order", o.getOrderNumber()));
        facts.add(row("Placed", time(o.getCreatedAt(), now)));
        if (!confirmation) {
            facts.add(row("Updated", time(now, now)));
        }
        facts.add(row("Status", statusLabel(o.getStatus())));
        facts.add(row("Payment", paymentLabel(o)));

        List<String[]> items = itemRows(o.getItems(), true);
        List<String[]> totals = new ArrayList<>();
        if (confirmation) {
            totals.add(row("Subtotal", money(o.getSubtotal())));
            if (positive(o.getDiscount())) {
                totals.add(row(StringUtils.hasText(o.getCouponCode()) ? "Discount (" + o.getCouponCode() + ")"
                        : "Discount", "−" + money(o.getDiscount())));
            }
            totals.add(row(deliveryLabel(o.getDeliveryType()), positive(o.getDeliveryFee())
                    ? money(o.getDeliveryFee()) : "Free"));
        }
        totals.add(row(o.getPaymentMethod() == PaymentMethod.COD ? "Total (cash on delivery)" : "Total",
                money(o.getTotal())));

        StringBuilder text = new StringBuilder();
        text.append("Hi ").append(to.firstName()).append(",\n\n").append(headline).append("\n\n");
        appendFacts(text, facts);
        text.append("\nItems\n");
        appendItems(text, items);
        for (String[] t : totals) {
            text.append(t[0]).append(": ").append(t[1]).append('\n');
        }
        if (confirmation) {
            text.append("\nDelivering to\n").append(address(to)).append('\n');
        }
        text.append("\nTrack your order: ").append(track).append("\n\n— GiftGenius\n");

        StringBuilder html = new StringBuilder();
        html.append(heading("Hi " + to.firstName() + ",")).append(paragraph(headline));
        html.append(details(facts));
        html.append(section("Your items")).append(lines(items, totals));
        if (confirmation) {
            html.append(section("Delivering to")).append(paragraph(address(to)));
        }
        html.append(button("Track your order", track));
        html.append(note("If you didn’t place this order, tell us at " + publicUrl + "/contact."));
        return new Content(subject, text.toString(), document(subject, headline, html.toString()));
    }

    /** "Part of your order is on its way / has been delivered", when one seller ships or delivers their lines. */
    Content partialShipment(Order o, String storeName, List<OrderItem> mine, FulfillmentStatus step, String note,
            Instant now) {
        ShippingAddress to = o.getShipping();
        String subject = "Update on your GiftGenius order " + o.getOrderNumber();
        String headline = (step == FulfillmentStatus.DELIVERED ? "Part of your order has been delivered"
                : "Part of your order is on its way") + ", sent by " + storeName + ":";
        String track = publicUrl + "/track?order=" + encode(o.getOrderNumber());
        List<String[]> items = itemRows(mine, false);
        List<String[]> facts = List.of(row("Order", o.getOrderNumber()), row("Updated", time(now, now)));

        StringBuilder text = new StringBuilder();
        text.append("Hi ").append(to.firstName()).append(",\n\n").append(headline).append("\n\n");
        appendItems(text, items);
        if (StringUtils.hasText(note)) {
            text.append('\n').append(note).append('\n');
        }
        text.append("\nOrder ").append(o.getOrderNumber()).append("\nUpdated: ").append(time(now, now))
                .append("\nTrack your order: ").append(track).append("\n\n— GiftGenius\n");

        StringBuilder html = new StringBuilder();
        html.append(heading("Hi " + to.firstName() + ",")).append(paragraph(headline));
        html.append(lines(items, List.of()));
        if (StringUtils.hasText(note)) {
            html.append(section("Note from " + storeName)).append(paragraph(note));
        }
        html.append("<div style=\"height:14px;\"></div>\n").append(details(facts));
        html.append(button("Track your order", track));
        return new Content(subject, text.toString(), document(subject, headline, html.toString()));
    }

    // ── To a seller ──

    /** A new order's lines for one seller: what to send, not who the customer is. */
    Content seller(Order o, String storeName, List<OrderItem> mine, Instant now) {
        String subject = "New GiftGenius order " + o.getOrderNumber();
        String link = publicUrl + "/seller/orders/" + encode(o.getOrderNumber());
        boolean personalised = mine.stream()
                .anyMatch(i -> StringUtils.hasText(i.getCustomName()) || StringUtils.hasText(i.getCustomMessage()));
        String personalisation = "This order has personalisation. The wording is in the Seller Center.";
        List<String[]> facts = List.of(row("Order", o.getOrderNumber()), row("Placed", time(o.getCreatedAt(), now)),
                row("Delivery", deliveryLabel(o.getDeliveryType())));
        List<String[]> items = itemRows(mine, false);

        StringBuilder text = new StringBuilder();
        text.append("Hi ").append(storeName).append(",\n\nYou have a new order to fulfil: ")
                .append(o.getOrderNumber()).append("\n\n");
        appendFacts(text, facts.subList(1, facts.size()));
        text.append('\n');
        appendItems(text, items);
        if (personalised) {
            text.append('\n').append(personalisation).append('\n');
        }
        text.append("\nDelivery details and status updates: ").append(link)
                .append("\n\n— GiftGenius Seller Center\n");

        StringBuilder html = new StringBuilder();
        html.append(heading("Hi " + storeName + ",")).append(paragraph("You have a new order to fulfil."));
        html.append(details(facts));
        html.append(section("Items to send")).append(lines(items, List.of()));
        if (personalised) {
            html.append(note(personalisation));
        }
        html.append(button("Open the order in the Seller Center", link));
        html.append(note("Delivery details are shown there after you sign in."));
        return new Content(subject, text.toString(),
                document(subject, "You have a new order to fulfil: " + o.getOrderNumber(), html.toString()));
    }

    // ── To the owner ──

    /**
     * A confirmed order for the people who run GiftGenius. {@code storeNames} names the seller of each seller's
     * lines (by seller id); lines without one are GiftGenius's own.
     */
    Content owner(Order o, Map<Long, String> storeNames, Instant now) {
        ShippingAddress to = o.getShipping();
        String subject = "New GiftGenius order " + o.getOrderNumber() + " (" + money(o.getTotal()) + ")";
        String link = publicUrl + "/admin/orders";
        String customer = to.getFullName() + " <" + to.getEmail() + ">" + (StringUtils.hasText(to.getCity())
                ? ", " + to.getCity() : "");

        List<String[]> facts = new ArrayList<>();
        facts.add(row("Order", o.getOrderNumber()));
        facts.add(row("Placed", time(o.getCreatedAt(), now)));
        facts.add(row("Status", statusLabel(o.getStatus())));
        facts.add(row("Payment", paymentLabel(o)));
        facts.add(row("Delivery", deliveryLabel(o.getDeliveryType())));
        if (StringUtils.hasText(o.getCouponCode())) {
            facts.add(row("Coupon", o.getCouponCode()));
        }
        facts.add(row("Customer", customer));

        List<String[]> items = new ArrayList<>();
        for (OrderItem i : o.getItems()) {
            String soldBy = i.getSellerId() == null ? "Sold by GiftGenius"
                    : "Sold by " + storeNames.getOrDefault(i.getSellerId(), "a marketplace seller");
            items.add(new String[] { i.getProductName() + " × " + i.getQuantity(), soldBy, money(i.getLineTotal()) });
        }
        List<String[]> totals = List.<String[]>of(row("Total", money(o.getTotal())));

        StringBuilder text = new StringBuilder();
        text.append("New order ").append(o.getOrderNumber()).append("\n\n");
        appendFacts(text, facts.subList(1, facts.size()));
        text.append("\nItems\n");
        appendItems(text, items);
        text.append("Total: ").append(money(o.getTotal())).append('\n');
        text.append("\nOpen Store Admin: ").append(link).append("\n\n— GiftGenius\n");

        StringBuilder html = new StringBuilder();
        html.append(heading("New order " + o.getOrderNumber()));
        html.append(details(facts));
        html.append(section("Items")).append(lines(items, totals));
        html.append(button("Open Store Admin", link));
        return new Content(subject, text.toString(),
                document(subject, "New order " + o.getOrderNumber() + ", " + money(o.getTotal()), html.toString()));
    }

    // ── Shared wording ──

    private static List<String[]> itemRows(List<OrderItem> items, boolean withPersonalisation) {
        List<String[]> rows = new ArrayList<>();
        for (OrderItem i : items) {
            String small = withPersonalisation && StringUtils.hasText(i.getCustomName())
                    ? "Personalised for " + i.getCustomName() : null;
            rows.add(new String[] { i.getProductName() + " × " + i.getQuantity(), small,
                    withPersonalisation ? money(i.getLineTotal()) : "" });
        }
        return rows;
    }

    private static void appendFacts(StringBuilder text, List<String[]> facts) {
        for (String[] f : facts) {
            text.append(f[0]).append(f[0].equals("Order") ? " " : ": ").append(f[1]).append('\n');
        }
    }

    private static void appendItems(StringBuilder text, List<String[]> items) {
        for (String[] i : items) {
            text.append("  • ").append(i[0]);
            if (StringUtils.hasText(i[2])) {
                text.append(" — ").append(i[2]);
            }
            if (i[1] != null) {
                text.append(" (").append(i[1]).append(')');
            }
            text.append('\n');
        }
    }

    private static String address(ShippingAddress a) {
        StringBuilder out = new StringBuilder(a.getFullName()).append('\n').append(a.getAddressLine()).append('\n');
        out.append(a.getCity());
        if (StringUtils.hasText(a.getState())) {
            out.append(", ").append(a.getState());
        }
        if (StringUtils.hasText(a.getPincode())) {
            out.append(' ').append(a.getPincode());
        }
        if (StringUtils.hasText(a.getPhone())) {
            out.append("\nPhone: ").append(a.getPhone());
        }
        return out.toString();
    }

    private String time(Instant at, Instant fallback) {
        return when.format(at == null ? fallback : at);
    }

    /** "₹12,34,567.50": rupees with two decimals and Indian digit grouping (thousands, then lakhs and crores). */
    static String money(BigDecimal amount) {
        BigDecimal value = (amount == null ? BigDecimal.ZERO : amount).setScale(2, RoundingMode.HALF_UP);
        String plain = value.abs().toPlainString();
        String whole = plain.substring(0, plain.indexOf('.'));
        StringBuilder grouped = new StringBuilder();
        int head = whole.length() - 3;
        for (int i = 0; i < head; i++) {
            grouped.append(whole.charAt(i));
            if ((head - i) % 2 == 1) {
                grouped.append(',');
            }
        }
        grouped.append(whole.substring(Math.max(head, 0)));
        return (value.signum() < 0 ? "−" : "") + "₹" + grouped + plain.substring(plain.indexOf('.'));
    }

    private static boolean positive(BigDecimal amount) {
        return amount != null && amount.signum() > 0;
    }

    static String statusLabel(OrderStatus status) {
        return switch (status) {
            case PENDING_PAYMENT -> "Awaiting payment";
            case CONFIRMED -> "Confirmed";
            case PACKED -> "Packed";
            case SHIPPED -> "Shipped";
            case OUT_FOR_DELIVERY -> "Out for delivery";
            case DELIVERED -> "Delivered";
            case CANCELLED -> "Cancelled";
        };
    }

    private static String paymentLabel(Order o) {
        if (o.getPaymentStatus() == PaymentStatus.REFUND_PENDING) {
            return "Refund in progress";
        }
        if (o.getPaymentMethod() == PaymentMethod.COD) {
            return "Cash on delivery";
        }
        return o.getPaymentStatus() == PaymentStatus.PAID ? "Paid online" : "Online payment";
    }

    private static String deliveryLabel(DeliveryType type) {
        if (type == null) {
            return "Delivery";
        }
        return switch (type) {
            case STANDARD -> "Standard delivery";
            case EXPRESS -> "Express delivery";
            case SAME_DAY -> "Same-day delivery";
        };
    }

    private static String[] row(String label, String value) {
        return new String[] { label, value };
    }

    private static String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
