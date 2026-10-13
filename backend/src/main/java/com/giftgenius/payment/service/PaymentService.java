package com.giftgenius.payment.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.giftgenius.common.ApiException;
import com.giftgenius.order.model.Order;
import com.giftgenius.order.dto.OrderDtos.OrderDto;
import com.giftgenius.order.mapper.OrderMapper;
import com.giftgenius.order.service.OrderPayments;
import com.giftgenius.order.repository.OrderRepository;
import com.giftgenius.order.model.OrderStatus;
import com.giftgenius.order.model.PaymentMethod;
import com.giftgenius.order.model.PaymentStatus;
import com.giftgenius.payment.dto.PaymentDtos.VerifyPaymentRequest;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Deciding that an online payment is genuine, from the shopper's browser or Razorpay's webhook: signatures,
 * ownership, order state and amount. Both paths lock the order row, so they can't confirm one payment twice.
 * What then happens to the order is OrderPayments' job.
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private final OrderRepository orders;
    private final OrderPayments orderPayments;
    private final OrderMapper mapper;
    private final RazorpayClient razorpay;
    private final ObjectMapper json;

    public PaymentService(OrderRepository orders, OrderPayments orderPayments, OrderMapper mapper,
            RazorpayClient razorpay, ObjectMapper json) {
        this.orders = orders;
        this.orderPayments = orderPayments;
        this.mapper = mapper;
        this.razorpay = razorpay;
        this.json = json;
    }

    /**
     * Confirms a payment from the shopper's browser. Only the signature proves it: Razorpay signs
     * order_id|payment_id with our key secret, and the Razorpay order was created here for exactly this order's
     * total, so the amount can't differ. Idempotent, and serialised with the webhook by the row lock.
     */
    @Transactional
    public OrderDto verifyPayment(Long userId, String orderNumber, VerifyPaymentRequest req) {
        Order o = orders.lockByOrderNumberAndUserId(orderNumber, userId)
                .orElseThrow(() -> ApiException.notFound("Order not found."));
        if (o.getPaymentStatus() == PaymentStatus.PAID) {
            return mapper.toDto(o); // already confirmed, by the webhook or another tab
        }
        boolean payable = o.getStatus() == OrderStatus.PENDING_PAYMENT;
        // Cancelled (by the shopper, an admin or the payment window) while the payment was in flight.
        boolean cancelledMeanwhile = o.getStatus() == OrderStatus.CANCELLED && o.getRazorpayOrderId() != null;
        if (o.getPaymentMethod() != PaymentMethod.ONLINE || !(payable || cancelledMeanwhile)) {
            throw ApiException.conflict("This order can no longer be paid.");
        }
        if (!razorpay.isEnabled()) {
            throw ApiException.unavailable("We couldn't confirm your payment just now. If money was deducted, "
                    + "it will be confirmed automatically or refunded.");
        }
        if (!req.razorpayOrderId().equals(o.getRazorpayOrderId())
                || !RazorpaySignatures.verifyPayment(req.razorpayOrderId(), req.razorpayPaymentId(),
                        req.razorpaySignature(), razorpay.keySecret())) {
            log.warn("Payment signature mismatch on order {}", orderNumber);
            throw ApiException.badRequest("We couldn't verify this payment. If money was deducted, "
                    + "it will be confirmed automatically or refunded.");
        }
        if (payable) {
            orderPayments.markPaid(o, req.razorpayPaymentId());
        } else {
            orderPayments.recordLatePayment(o, req.razorpayPaymentId());
        }
        return mapper.toDto(o);
    }

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
        // Locked: the shopper's browser may be verifying this same payment right now.
        orders.lockByRazorpayOrderId(rzpOrderId).ifPresent(o -> {
            switch (event) {
                case "payment.captured", "order.paid" -> {
                    if (o.getPaymentStatus() == PaymentStatus.PAID) {
                        return; // duplicate delivery, or the browser confirmed it first
                    }
                    if (o.getStatus() == OrderStatus.CANCELLED) {
                        orderPayments.recordLatePayment(o, paymentId);
                    } else if (o.getStatus() == OrderStatus.PENDING_PAYMENT) {
                        if (paidInFull(o, payment)) {
                            orderPayments.markPaid(o, paymentId);
                        } else {
                            log.error("Razorpay {} {} on order {} was {} {} paise, not the order total; not confirming it",
                                    event, paymentId, o.getOrderNumber(), payment.path("currency").asString("?"),
                                    payment.path("amount").asString("?"));
                        }
                    }
                }
                case "payment.failed" -> {
                    orderPayments.markFailed(o);
                }
                default -> log.debug("Ignoring Razorpay event {}", event);
            }
        });
    }

    /** A webhook's payment entity covers this order exactly: the full total, in rupees. */
    private static boolean paidInFull(Order o, JsonNode payment) {
        return "INR".equals(payment.path("currency").asString(""))
                && payment.path("amount").asLong(-1) == Paise.of(o.getTotal());
    }
}
