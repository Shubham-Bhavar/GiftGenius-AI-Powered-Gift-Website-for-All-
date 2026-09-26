package com.giftgenius.order;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import com.giftgenius.cart.Cart;
import com.giftgenius.cart.CartItem;
import com.giftgenius.cart.CartService;
import com.giftgenius.catalog.ProductRepository;
import com.giftgenius.common.ApiException;
import com.giftgenius.common.PageResponse;
import com.giftgenius.config.AppProperties;
import com.giftgenius.notify.Mailer;
import com.giftgenius.order.OrderDtos.OrderDto;
import com.giftgenius.order.OrderDtos.OrderItemDto;
import com.giftgenius.order.OrderDtos.OrderSummaryDto;
import com.giftgenius.order.OrderDtos.PaymentInstructions;
import com.giftgenius.order.OrderDtos.PlaceOrderRequest;
import com.giftgenius.order.OrderDtos.ShippingDto;
import com.giftgenius.order.OrderDtos.ShippingRequest;
import com.giftgenius.order.OrderDtos.StatusEventDto;
import com.giftgenius.order.OrderDtos.StatusUpdateRequest;
import com.giftgenius.order.OrderDtos.TrackingDto;
import com.giftgenius.order.OrderDtos.VerifyPaymentRequest;
import com.giftgenius.payment.RazorpayClient;
import com.giftgenius.payment.RazorpayClient.RazorpayOrder;
import com.giftgenius.payment.RazorpaySignatures;
import com.giftgenius.pricing.CouponRepository;
import com.giftgenius.pricing.PricingDtos.Quote;
import com.giftgenius.pricing.PricingDtos.QuoteLine;
import com.giftgenius.pricing.PricingDtos.QuoteLineRequest;
import com.giftgenius.pricing.PricingService;
import com.giftgenius.user.UserRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final char[] ORDER_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789".toCharArray();

    /** Result of the first checkout transaction. */
    private record Placement(Long orderId, String orderNumber, BigDecimal total, boolean needsPayment, OrderDto dto) {
    }

    private final OrderRepository orders;
    private final CartService carts;
    private final PricingService pricing;
    private final ProductRepository products;
    private final CouponRepository coupons;
    private final RazorpayClient razorpay;
    private final UserRepository users;
    private final ObjectMapper json;
    private final Mailer mailer;
    private final TransactionTemplate tx;
    private final AppProperties.Orders orderProps;
    private final String publicUrl;

    public OrderService(OrderRepository orders, CartService carts, PricingService pricing,
            ProductRepository products, CouponRepository coupons, RazorpayClient razorpay,
            UserRepository users, ObjectMapper json, Mailer mailer, PlatformTransactionManager txManager,
            AppProperties properties) {
        this.orders = orders;
        this.carts = carts;
        this.pricing = pricing;
        this.products = products;
        this.coupons = coupons;
        this.razorpay = razorpay;
        this.users = users;
        this.json = json;
        this.mailer = mailer;
        this.tx = new TransactionTemplate(txManager);
        this.orderProps = properties.orders();
        String url = properties.publicUrl();
        this.publicUrl = url != null && url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    // ── Customer ───────────────────────────────────────────

    /**
     * Places an order from the customer's cart in up to three short transactions, so no database
     * locks are held while Razorpay is called:
     * <ol>
     *   <li>validate, reserve stock and coupon, save the order;</li>
     *   <li>(online payment only, no transaction) create the Razorpay order;</li>
     *   <li>attach the Razorpay order id, or cancel and release everything if step 2 failed.</li>
     * </ol>
     */
    public OrderDto place(Long userId, PlaceOrderRequest req, String idempotencyKey) {
        String key = normalizeKey(idempotencyKey);
        Placement p = tx.execute(s -> reserve(userId, req, key));
        if (!p.needsPayment()) {
            return p.dto();
        }
        RazorpayOrder rzp;
        try {
            rzp = razorpay.createOrder(p.total(), p.orderNumber());
        } catch (RuntimeException e) {
            tx.executeWithoutResult(s -> orders.findById(p.orderId()).ifPresent(o -> {
                o.setPaymentStatus(PaymentStatus.FAILED);
                doCancel(o, "Online payment couldn't be started");
            }));
            throw e instanceof ApiException ? e
                    : ApiException.unavailable("Online payment is temporarily unavailable. Try again or choose Cash on Delivery.");
        }
        return tx.execute(s -> {
            Order o = orders.findById(p.orderId()).orElseThrow();
            o.setRazorpayOrderId(rzp.id());
            return toDto(o);
        });
    }

    private Placement reserve(Long userId, PlaceOrderRequest req, String key) {
        users.lockById(userId).orElseThrow(() -> ApiException.unauthorized("Please sign in again."));

        if (key != null) {
            var existing = orders.findByUserIdAndIdempotencyKey(userId, key);
            if (existing.isPresent()) {
                Order o = existing.get();
                if (o.getStatus() == OrderStatus.PENDING_PAYMENT && o.getRazorpayOrderId() == null) {
                    throw ApiException.conflict("Your order is still being set up. Wait a moment and try again.");
                }
                return new Placement(o.getId(), o.getOrderNumber(), o.getTotal(), false, toDto(o));
            }
        }
        boolean online = req.paymentMethod() == PaymentMethod.ONLINE;
        if (online && !razorpay.isEnabled()) {
            throw ApiException.badRequest("Online payment isn't available right now. Choose Cash on Delivery.");
        }
        if (online && orders.countByUserIdAndStatus(userId, OrderStatus.PENDING_PAYMENT)
                >= orderProps.maxPendingPerUser()) {
            throw ApiException.conflict("You have unpaid orders waiting. Pay for or cancel them in My orders first.");
        }

        Cart cart = carts.cartFor(userId);
        if (cart.getItems().isEmpty()) {
            throw ApiException.badRequest("Your cart is empty.");
        }

        // Price and stock are checked per product; personalised lines of the same product share stock.
        Map<Long, Integer> qtyByProduct = new LinkedHashMap<>();
        for (CartItem ci : cart.getItems()) {
            qtyByProduct.merge(ci.getProduct().getId(), ci.getQuantity(), Integer::sum);
        }
        List<QuoteLineRequest> lines = qtyByProduct.entrySet().stream()
                .map(e -> new QuoteLineRequest(e.getKey(), e.getValue())).toList();
        Quote quote = pricing.quote(lines, req.couponCode(), req.deliveryType(), true, userId);
        Map<Long, QuoteLine> priced = quote.lines().stream()
                .collect(Collectors.toMap(QuoteLine::productId, Function.identity()));

        for (QuoteLineRequest line : lines) {
            if (products.reserveStock(line.productId(), line.quantity()) == 0) {
                throw ApiException.conflict("Sorry, " + priced.get(line.productId()).name()
                        + " just sold out. Update your cart and try again.");
            }
        }
        if (quote.couponCode() != null && coupons.consume(quote.couponCode()) == 0) {
            throw ApiException.conflict("That coupon has just run out. Remove it to continue.");
        }

        Order order = new Order();
        order.setOrderNumber(newOrderNumber());
        order.setUser(users.getReferenceById(userId));
        order.setShipping(toAddress(req.shipping()));
        order.setDeliveryType(quote.deliveryType());
        order.setPaymentMethod(req.paymentMethod());
        order.setPaymentStatus(PaymentStatus.PENDING);
        order.setSubtotal(quote.subtotal());
        order.setDiscount(quote.discount());
        order.setDeliveryFee(quote.deliveryFee());
        order.setTotal(quote.total());
        order.setCouponCode(quote.couponCode());
        order.setIdempotencyKey(key);

        for (CartItem ci : cart.getItems()) {
            BigDecimal unit = priced.get(ci.getProduct().getId()).unitPrice();
            OrderItem oi = new OrderItem();
            oi.setProductId(ci.getProduct().getId());
            oi.setProductName(ci.getProduct().getName());
            oi.setImageUrl(ci.getProduct().getImageUrl());
            oi.setUnitPrice(unit);
            oi.setQuantity(ci.getQuantity());
            oi.setLineTotal(unit.multiply(BigDecimal.valueOf(ci.getQuantity())));
            oi.setCustomName(ci.getCustomName());
            oi.setCustomMessage(ci.getCustomMessage());
            order.addItem(oi);
        }

        boolean nothingToPay = order.getTotal().signum() <= 0;
        boolean needsPayment = online && !nothingToPay;
        if (needsPayment) {
            // Cart is kept until payment succeeds, so an abandoned payment doesn't lose the basket.
            order.recordStatus(OrderStatus.PENDING_PAYMENT, "Waiting for online payment");
        } else {
            if (nothingToPay) {
                order.setPaymentStatus(PaymentStatus.PAID);
            }
            order.recordStatus(OrderStatus.CONFIRMED,
                    nothingToPay ? "Order placed" : "Order placed. Pay when it arrives.");
            cart.getItems().clear();
            cart.touch();
        }
        orders.save(order);
        log.info("Order {} placed by user {} ({}, ₹{})", order.getOrderNumber(), userId,
                order.getPaymentMethod(), order.getTotal());
        if (!needsPayment) {
            notifyCustomer(order, "Your GiftGenius order " + order.getOrderNumber() + " is confirmed",
                    "Thank you! Your order is confirmed and we're getting it ready.");
        }
        return new Placement(order.getId(), order.getOrderNumber(), order.getTotal(), needsPayment,
                needsPayment ? null : toDto(order));
    }

    @Transactional
    public OrderDto verifyPayment(Long userId, String orderNumber, VerifyPaymentRequest req) {
        Order o = ownOrder(userId, orderNumber);
        if (o.getPaymentStatus() == PaymentStatus.PAID) {
            return toDto(o);
        }
        if (o.getStatus() != OrderStatus.PENDING_PAYMENT) {
            throw ApiException.conflict("This order can no longer be paid.");
        }
        if (!req.razorpayOrderId().equals(o.getRazorpayOrderId())
                || !RazorpaySignatures.verifyPayment(req.razorpayOrderId(), req.razorpayPaymentId(),
                        req.razorpaySignature(), razorpay.keySecret())) {
            log.warn("Payment signature mismatch on order {}", orderNumber);
            throw ApiException.badRequest("We couldn't verify this payment. If money was deducted, "
                    + "it will be confirmed automatically or refunded.");
        }
        markPaid(o, req.razorpayPaymentId());
        return toDto(o);
    }

    @Transactional
    public OrderDto cancel(Long userId, String orderNumber) {
        Order o = ownOrder(userId, orderNumber);
        if (!OrderStatus.CANCELLABLE.contains(o.getStatus())) {
            throw ApiException.conflict(o.getStatus() == OrderStatus.CANCELLED
                    ? "This order is already cancelled."
                    : "This order has already shipped, so it can't be cancelled.");
        }
        doCancel(o, "Cancelled by you");
        notifyCustomer(o, "Your GiftGenius order " + o.getOrderNumber() + " was cancelled",
                o.getPaymentStatus() == PaymentStatus.REFUND_PENDING
                        ? "Your order is cancelled. Your refund is being processed and usually arrives in 5–7 working days."
                        : "Your order is cancelled as you asked.");
        return toDto(o);
    }

    @Transactional(readOnly = true)
    public PageResponse<OrderSummaryDto> mine(Long userId, int page, int size) {
        return PageResponse.of(orders.findByUserIdOrderByCreatedAtDesc(userId,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 50))).map(OrderService::toSummary));
    }

    @Transactional(readOnly = true)
    public OrderDto get(Long userId, String orderNumber) {
        return toDto(ownOrder(userId, orderNumber));
    }

    /** Public lookup. The email must match the order, and failures look identical to avoid enumeration. */
    @Transactional(readOnly = true)
    public TrackingDto track(String orderNumber, String email) {
        Order o = orders.findByOrderNumber(orderNumber.trim().toUpperCase())
                .filter(x -> email != null && x.getShipping().getEmail().equalsIgnoreCase(email.trim()))
                .orElseThrow(() -> ApiException.notFound(
                        "No order matches that order ID and email. Check both and try again."));
        return new TrackingDto(o.getOrderNumber(), o.getStatus(), o.getPaymentMethod(), o.getPaymentStatus(),
                o.getDeliveryType(),
                o.getTotal(), firstName(o), o.getShipping().getCity(), items(o), timeline(o), o.getCreatedAt());
    }

    // ── Payments (webhook) ─────────────────────────────────

    @Transactional
    public void handleRazorpayWebhook(String rawBody, String signature) {
        if (!razorpay.isEnabled() || !StringUtils.hasText(razorpay.webhookSecret())) {
            throw ApiException.notFound("Webhook not configured.");
        }
        if (!RazorpaySignatures.verifyWebhook(rawBody, signature, razorpay.webhookSecret())) {
            throw ApiException.badRequest("Invalid signature.");
        }
        JsonNode root;
        try {
            root = json.readTree(rawBody);
        } catch (Exception e) {
            throw ApiException.badRequest("Malformed payload.");
        }
        String event = root.path("event").asString("");
        JsonNode payment = root.path("payload").path("payment").path("entity");
        String rzpOrderId = payment.path("order_id").asString(null);
        String paymentId = payment.path("id").asString(null);
        if (rzpOrderId == null) {
            return;
        }
        orders.findByRazorpayOrderId(rzpOrderId).ifPresent(o -> {
            switch (event) {
                case "payment.captured", "order.paid" -> {
                    if (o.getPaymentStatus() == PaymentStatus.PAID) {
                        return;
                    }
                    if (o.getStatus() == OrderStatus.PENDING_PAYMENT) {
                        markPaid(o, paymentId);
                    } else if (o.getStatus() == OrderStatus.CANCELLED
                            && o.getPaymentStatus() != PaymentStatus.REFUND_PENDING) {
                        // Paid after the payment window closed: money must go back.
                        o.setRazorpayPaymentId(paymentId);
                        o.setPaymentStatus(PaymentStatus.REFUND_PENDING);
                        log.warn("Late payment {} on cancelled order {}; refund required", paymentId,
                                o.getOrderNumber());
                    }
                }
                case "payment.failed" -> {
                    if (o.getStatus() == OrderStatus.PENDING_PAYMENT) {
                        o.setPaymentStatus(PaymentStatus.FAILED);
                    }
                }
                default -> log.debug("Ignoring Razorpay event {}", event);
            }
        });
    }

    // ── Admin ──────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<OrderSummaryDto> adminList(List<OrderStatus> statuses, int page, int size) {
        PageRequest pr = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        var result = statuses == null || statuses.isEmpty() ? orders.findAllByOrderByCreatedAtDesc(pr)
                : orders.findByStatusInOrderByCreatedAtDesc(statuses, pr);
        return PageResponse.of(result.map(OrderService::toSummary));
    }

    @Transactional(readOnly = true)
    public OrderDto adminGet(String orderNumber) {
        return toDto(orders.findByOrderNumber(orderNumber)
                .orElseThrow(() -> ApiException.notFound("Order not found.")));
    }

    @Transactional
    public OrderDto adminUpdateStatus(String orderNumber, StatusUpdateRequest req) {
        Order o = orders.findByOrderNumber(orderNumber)
                .orElseThrow(() -> ApiException.notFound("Order not found."));
        OrderStatus next = req.status();
        if (next == OrderStatus.CONFIRMED || next == OrderStatus.PENDING_PAYMENT) {
            throw ApiException.badRequest("Orders are confirmed by payment or checkout, not manually.");
        }
        if (!o.getStatus().canMoveTo(next)) {
            throw ApiException.conflict("Can't move an order from " + o.getStatus() + " to " + next + ".");
        }
        String note = StringUtils.hasText(req.note()) ? req.note().trim() : defaultNote(next);
        if (next == OrderStatus.CANCELLED) {
            doCancel(o, note);
        } else {
            o.recordStatus(next, note);
            if (next == OrderStatus.DELIVERED && o.getPaymentMethod() == PaymentMethod.COD) {
                o.setPaymentStatus(PaymentStatus.PAID);
            }
        }
        String headline = switch (next) {
            case PACKED -> "Your gift is wrapped and packed.";
            case SHIPPED -> "Your gift is on its way with our delivery partner.";
            case OUT_FOR_DELIVERY -> "Your gift is out for delivery today.";
            case DELIVERED -> "Your gift has been delivered. We hope they love it!";
            case CANCELLED -> o.getPaymentStatus() == PaymentStatus.REFUND_PENDING
                    ? "We're sorry: we had to cancel your order. Your refund is being processed."
                    : "We're sorry: we had to cancel your order.";
            default -> null;
        };
        if (headline != null && next != OrderStatus.PACKED) {
            notifyCustomer(o, "Update on your GiftGenius order " + o.getOrderNumber(), headline);
        }
        return toDto(o);
    }

    /** Called by {@link PendingOrderReaper} in its own transaction per order. */
    @Transactional
    public void expireIfStillPending(Long orderId) {
        orders.findById(orderId).ifPresent(o -> {
            if (o.getStatus() == OrderStatus.PENDING_PAYMENT && o.getPaymentStatus() != PaymentStatus.PAID) {
                doCancel(o, "Payment wasn't completed in time");
                log.info("Expired unpaid order {}", o.getOrderNumber());
            }
        });
    }

    // ── Internals ──────────────────────────────────────────

    private void markPaid(Order o, String paymentId) {
        o.setPaymentStatus(PaymentStatus.PAID);
        o.setRazorpayPaymentId(paymentId);
        o.recordStatus(OrderStatus.CONFIRMED, "Payment received");
        carts.removeProducts(o.getUser().getId(),
                o.getItems().stream().map(OrderItem::getProductId).collect(Collectors.toSet()));
        notifyCustomer(o, "Payment received: GiftGenius order " + o.getOrderNumber() + " is confirmed",
                "Thank you! We've received your payment and your order is confirmed.");
    }

    private void doCancel(Order o, String note) {
        for (OrderItem item : o.getItems()) {
            products.releaseStock(item.getProductId(), item.getQuantity());
        }
        if (o.getCouponCode() != null) {
            coupons.release(o.getCouponCode());
        }
        if (o.getPaymentStatus() == PaymentStatus.PAID) {
            o.setPaymentStatus(PaymentStatus.REFUND_PENDING);
        }
        o.recordStatus(OrderStatus.CANCELLED, note);
    }

    private void notifyCustomer(Order o, String subject, String headline) {
        StringBuilder body = new StringBuilder();
        body.append("Hi ").append(firstName(o)).append(",\n\n").append(headline).append("\n\n");
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

    private Order ownOrder(Long userId, String orderNumber) {
        return orders.findByOrderNumberAndUserId(orderNumber, userId)
                .orElseThrow(() -> ApiException.notFound("Order not found."));
    }

    private String newOrderNumber() {
        String candidate;
        do {
            StringBuilder sb = new StringBuilder("GG-");
            for (int i = 0; i < 8; i++) {
                sb.append(ORDER_ALPHABET[RANDOM.nextInt(ORDER_ALPHABET.length)]);
            }
            candidate = sb.toString();
        } while (orders.existsByOrderNumber(candidate));
        return candidate;
    }

    private static String normalizeKey(String key) {
        if (!StringUtils.hasText(key)) {
            return null;
        }
        String k = key.trim();
        if (k.length() > 64) {
            throw ApiException.badRequest("Idempotency-Key must be at most 64 characters.");
        }
        return k;
    }

    private static String firstName(Order o) {
        return o.getShipping().getFullName().trim().split("\\s+")[0];
    }

    private static ShippingAddress toAddress(ShippingRequest s) {
        ShippingAddress a = new ShippingAddress();
        a.setFullName(s.fullName().trim());
        a.setEmail(s.email().trim().toLowerCase());
        a.setPhone(s.phone().trim());
        a.setAddressLine(s.addressLine().trim());
        a.setCity(s.city().trim());
        a.setState(StringUtils.hasText(s.state()) ? s.state().trim() : null);
        a.setPincode(s.pincode().trim());
        return a;
    }

    private static String defaultNote(OrderStatus s) {
        return switch (s) {
            case PACKED -> "Gift wrapped and packed";
            case SHIPPED -> "Handed to our delivery partner";
            case OUT_FOR_DELIVERY -> "Out for delivery";
            case DELIVERED -> "Delivered";
            case CANCELLED -> "Cancelled by GiftGenius";
            default -> null;
        };
    }

    private static List<OrderItemDto> items(Order o) {
        return o.getItems().stream().map(i -> new OrderItemDto(i.getProductId(), i.getProductName(),
                i.getImageUrl(), i.getUnitPrice(), i.getQuantity(), i.getLineTotal(), i.getCustomName(),
                i.getCustomMessage())).toList();
    }

    private static List<StatusEventDto> timeline(Order o) {
        return o.getEvents().stream().map(e -> new StatusEventDto(e.getStatus(), e.getNote(), e.getCreatedAt()))
                .toList();
    }

    private OrderDto toDto(Order o) {
        ShippingAddress s = o.getShipping();
        PaymentInstructions pay = null;
        if (o.getPaymentMethod() == PaymentMethod.ONLINE && o.getStatus() == OrderStatus.PENDING_PAYMENT
                && o.getRazorpayOrderId() != null) {
            pay = new PaymentInstructions("RAZORPAY", razorpay.keyId(), o.getRazorpayOrderId(),
                    o.getTotal().movePointRight(2).longValue(), "INR", s.getFullName(), s.getEmail(), s.getPhone());
        }
        return new OrderDto(o.getOrderNumber(), o.getStatus(), o.getPaymentMethod(), o.getPaymentStatus(),
                o.getDeliveryType(), o.getSubtotal(), o.getDiscount(), o.getDeliveryFee(), o.getTotal(),
                o.getCouponCode(),
                new ShippingDto(s.getFullName(), s.getEmail(), s.getPhone(), s.getAddressLine(), s.getCity(),
                        s.getState(), s.getPincode()),
                items(o), timeline(o), o.getCreatedAt(), pay);
    }

    private static OrderSummaryDto toSummary(Order o) {
        OrderItem first = o.getItems().isEmpty() ? null : o.getItems().get(0);
        int count = o.getItems().stream().mapToInt(OrderItem::getQuantity).sum();
        return new OrderSummaryDto(o.getOrderNumber(), o.getStatus(), o.getPaymentMethod(), o.getPaymentStatus(),
                o.getTotal(), count, o.getItems().size(),
                first == null ? null : first.getProductName(), first == null ? null : first.getImageUrl(),
                o.getCreatedAt(), o.getShipping().getEmail());
    }
}
