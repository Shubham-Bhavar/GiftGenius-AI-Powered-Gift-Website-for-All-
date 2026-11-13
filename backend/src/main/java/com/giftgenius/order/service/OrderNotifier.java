package com.giftgenius.order.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.TransactionException;
import org.springframework.util.StringUtils;

import com.giftgenius.config.AppProperties;
import com.giftgenius.notify.EmailKind;
import com.giftgenius.notify.EmailOutbox;
import com.giftgenius.seller.model.SellerProfile;
import com.giftgenius.seller.repository.SellerProfileRepository;
import com.giftgenius.order.model.FulfillmentStatus;
import com.giftgenius.order.model.Order;
import com.giftgenius.order.model.OrderItem;
import com.giftgenius.order.model.OrderStatus;

import jakarta.persistence.PersistenceException;

/**
 * Every email about an order: to the customer, to the sellers whose products are in it, and to the owner's
 * notification addresses. Each is queued in the email outbox inside the caller's transaction, under a key naming the
 * order, the event and the recipient, so the same email is never queued twice (see {@link EmailOutbox}). What each
 * email says is in {@link OrderEmails}.
 *
 * <p>An email whose content can't be built (a bug, or data the template doesn't expect) is logged, counted as a
 * {@code content} queue failure and skipped: it never fails the order it's about. A failure of the database
 * transaction itself is different (see {@link #isTransactionFailure}): it is passed on, never taken for a content
 * failure, because the order it would let through may already have been rolled back.
 */
@Component
class OrderNotifier {

    private static final Logger log = LoggerFactory.getLogger(OrderNotifier.class);

    /** The customer's email for an order event: confirmed, or a status it reached. */
    static final String CONFIRMED = "confirmed";
    /** At most this many owner addresses are notified of an order. */
    static final int MAX_OWNER_ADDRESSES = 10;
    static final String DEFAULT_ZONE = "Asia/Kolkata";

    private final EmailOutbox outbox;
    private final SellerProfileRepository sellers;
    private final OrderEmails emails;
    private final List<String> ownerAddresses;

    OrderNotifier(EmailOutbox outbox, SellerProfileRepository sellers, AppProperties properties) {
        this.outbox = outbox;
        this.sellers = sellers;
        String url = properties.publicUrl();
        String publicUrl = url != null && url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
        AppProperties.Mail mail = properties.mail();
        this.emails = new OrderEmails(publicUrl, zone(mail == null ? null : mail.timeZone()));
        this.ownerAddresses = ownerAddresses(mail == null ? null : mail.notifyAdminEmails(),
                properties.admin() == null ? null : properties.admin().email());
        if (ownerAddresses.isEmpty()) {
            log.warn("No owner notification address (NOTIFY_ADMIN_EMAILS or ADMIN_EMAIL): new orders won't be emailed "
                    + "to the owner.");
        }
    }

    static String status(OrderStatus status) {
        return "status:" + status.name();
    }

    /**
     * Whether a failure belongs to the order's database transaction rather than to an email's content: Spring's data
     * access and transaction exceptions, and JPA's (Hibernate's), which a lazy load can throw while an email is built.
     * Emails are queued inside the order's transaction, and on a deadlock MySQL rolls back that whole transaction,
     * order included; JPA marks it rollback-only for most of its own exceptions. Swallowing one would let the request
     * carry on as if the order had been saved, so they are passed on. ({@link EmailOutbox#enqueue} already turns a
     * statement-level database error into "not queued" and passes on only lock failures.)
     */
    static boolean isTransactionFailure(RuntimeException e) {
        return e instanceof DataAccessException || e instanceof PersistenceException
                || e instanceof TransactionException;
    }

    /**
     * Who is told about new orders: the configured notification addresses, or the admin account's address when none
     * is configured. Blank and malformed entries are dropped, and an address is kept once whatever its case.
     */
    static List<String> ownerAddresses(List<String> configured, String adminEmail) {
        List<String> candidates = new ArrayList<>();
        if (configured != null) {
            candidates.addAll(configured);
        }
        List<String> out = usable(candidates);
        if (out.isEmpty() && adminEmail != null) {
            out = usable(List.of(adminEmail));
        }
        return out;
    }

    private static List<String> usable(List<String> candidates) {
        Map<String, String> byLowerCase = new LinkedHashMap<>();
        for (String candidate : candidates) {
            String address = candidate == null ? "" : candidate.strip();
            int at = address.indexOf('@');
            boolean plausible = at > 0 && at < address.length() - 1 && address.length() <= 255
                    && address.chars().noneMatch(c -> Character.isWhitespace(c) || c == ',' || c == ';' || c == '<'
                            || c == '>');
            if (plausible) {
                byLowerCase.putIfAbsent(address.toLowerCase(Locale.ROOT), address);
            }
        }
        return byLowerCase.values().stream().limit(MAX_OWNER_ADDRESSES).toList();
    }

    private static ZoneId zone(String configured) {
        try {
            return ZoneId.of(StringUtils.hasText(configured) ? configured.strip() : DEFAULT_ZONE);
        } catch (DateTimeException e) {
            log.warn("MAIL_TIME_ZONE is not a known time zone; order emails show times in {}.", DEFAULT_ZONE);
            return ZoneId.of(DEFAULT_ZONE);
        }
    }

    /**
     * To the customer: a headline, the order's lines and total, and the tracking link. {@code event} is
     * {@link #CONFIRMED} (which also carries the price breakdown and the delivery address) or
     * {@link #status(OrderStatus)}: one email per order and event.
     */
    void customer(Order o, String event, String subject, String headline) {
        EmailKind kind = CONFIRMED.equals(event) ? EmailKind.ORDER_CONFIRMED : EmailKind.ORDER_STATUS;
        try {
            OrderEmails.Content c = emails.customer(o, subject, headline, kind == EmailKind.ORDER_CONFIRMED,
                    Instant.now());
            outbox.enqueue("order:" + o.getId() + ":" + event + ":customer", kind, o.getId(),
                    o.getShipping().getEmail(), c.subject(), c.text(), c.html());
        } catch (RuntimeException e) {
            if (isTransactionFailure(e)) {
                throw e;
            }
            contentFailed(o, kind, e);
        }
    }

    /** Emails each seller with lines in a newly confirmed order: what to send, not who the customer is. */
    void sellers(Order o) {
        Map<Long, List<OrderItem>> bySeller;
        try {
            bySeller = linesBySeller(o);
        } catch (RuntimeException e) {
            if (isTransactionFailure(e)) {
                throw e;
            }
            contentFailed(o, EmailKind.ORDER_NEW_FOR_SELLER, e);
            return;
        }
        if (bySeller.isEmpty()) {
            return;
        }
        for (SellerProfile seller : sellers.findAllById(bySeller.keySet())) {
            // One seller's email failing to build doesn't stop the others'.
            try {
                OrderEmails.Content c = emails.seller(o, seller.getStoreName(), bySeller.get(seller.getUserId()),
                        Instant.now());
                outbox.enqueue("order:" + o.getId() + ":confirmed:seller:" + seller.getUserId(),
                        EmailKind.ORDER_NEW_FOR_SELLER, o.getId(), seller.getUser().getEmail(), c.subject(),
                        c.text(), c.html());
            } catch (RuntimeException e) {
                if (isTransactionFailure(e)) {
                    throw e;
                }
                contentFailed(o, EmailKind.ORDER_NEW_FOR_SELLER, e);
            }
        }
    }

    /**
     * Tells the owner's notification addresses about a newly confirmed order: the customer's name, email and city,
     * the lines and who sells each, and the total. One email per address, each under its own key.
     */
    void owner(Order o) {
        if (ownerAddresses.isEmpty()) {
            return;
        }
        OrderEmails.Content c;
        try {
            Map<Long, List<OrderItem>> bySeller = linesBySeller(o);
            Map<Long, String> storeNames = bySeller.isEmpty() ? Map.of()
                    : sellers.findAllById(bySeller.keySet()).stream()
                            .collect(Collectors.toMap(SellerProfile::getUserId, SellerProfile::getStoreName,
                                    (a, b) -> a));
            c = emails.owner(o, storeNames, Instant.now());
        } catch (RuntimeException e) {
            if (isTransactionFailure(e)) {
                throw e;
            }
            contentFailed(o, EmailKind.ORDER_NEW_FOR_OWNER, e);
            return;
        }
        for (String address : ownerAddresses) {
            try {
                outbox.enqueue("order:" + o.getId() + ":confirmed:owner:" + shortHash(address),
                        EmailKind.ORDER_NEW_FOR_OWNER, o.getId(), address, c.subject(), c.text(), c.html());
            } catch (RuntimeException e) {
                if (isTransactionFailure(e)) {
                    throw e;
                }
                contentFailed(o, EmailKind.ORDER_NEW_FOR_OWNER, e);
            }
        }
    }

    /** "Part of your order is on its way / has been delivered", when a seller ships or delivers their lines. */
    void partialShipment(Order o, SellerProfile seller, List<OrderItem> mine, FulfillmentStatus step, String note) {
        try {
            OrderEmails.Content c = emails.partialShipment(o, seller.getStoreName(), mine, step, note, Instant.now());
            outbox.enqueue("order:" + o.getId() + ":seller:" + seller.getUserId() + ":" + step.name() + ":customer",
                    EmailKind.ORDER_PART_SHIPPED, o.getId(), o.getShipping().getEmail(), c.subject(), c.text(),
                    c.html());
        } catch (RuntimeException e) {
            if (isTransactionFailure(e)) {
                throw e;
            }
            contentFailed(o, EmailKind.ORDER_PART_SHIPPED, e);
        }
    }

    private static Map<Long, List<OrderItem>> linesBySeller(Order o) {
        return o.getItems().stream().filter(i -> i.getSellerId() != null)
                .collect(Collectors.groupingBy(OrderItem::getSellerId, LinkedHashMap::new, Collectors.toList()));
    }

    /** Names an address in a dedupe key without putting the address there. */
    private static String shortHash(String address) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(address.toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash, 0, 8);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is always available", e);
        }
    }

    /** Logged with the order number and the error's type, and counted; the order goes ahead. */
    private void contentFailed(Order o, EmailKind kind, RuntimeException e) {
        log.error("Email {} for order {} not queued: its content couldn't be built ({})", kind,
                o == null ? null : o.getOrderNumber(), e.getClass().getSimpleName(), e);
        outbox.countFailure(EmailOutbox.Failure.CONTENT);
    }
}
