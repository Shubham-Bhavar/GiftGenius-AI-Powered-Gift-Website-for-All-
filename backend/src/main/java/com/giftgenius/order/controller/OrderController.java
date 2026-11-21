package com.giftgenius.order.controller;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.common.PageResponse;
import com.giftgenius.order.dto.OrderDtos.OrderDto;
import com.giftgenius.order.dto.OrderDtos.OrderSummaryDto;
import com.giftgenius.order.dto.OrderDtos.PlaceOrderRequest;
import com.giftgenius.order.dto.OrderDtos.TrackRequest;
import com.giftgenius.order.dto.OrderDtos.TrackingDto;
import com.giftgenius.security.AuthUser;
import com.giftgenius.order.service.OrderService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService orders;

    public OrderController(OrderService orders) {
        this.orders = orders;
    }

    /** Places an order from the signed-in user's cart. Send a fresh Idempotency-Key per checkout attempt. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderDto place(@AuthenticationPrincipal AuthUser user, @Valid @RequestBody PlaceOrderRequest req,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        return orders.place(user.id(), req, idempotencyKey);
    }

    @GetMapping
    public PageResponse<OrderSummaryDto> mine(@AuthenticationPrincipal AuthUser user,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "10") int size) {
        return orders.mine(user.id(), page, size);
    }

    /**
     * Public tracking by order number and email, sent in the body so the email isn't written to access logs, browser
     * history or the Referer header (GG-40). Same answers and limits as the GET form below.
     */
    @PostMapping("/track")
    public TrackingDto trackByBody(@Valid @RequestBody TrackRequest req) {
        return orders.track(req.orderNumber(), req.email());
    }

    /** The original form, kept for links and clients that already use it; the site itself now sends POST. */
    @GetMapping("/track")
    public TrackingDto track(@RequestParam @NotBlank String orderNumber, @RequestParam @Email @NotBlank String email) {
        return orders.track(orderNumber, email);
    }

    @GetMapping("/{orderNumber}")
    public OrderDto get(@AuthenticationPrincipal AuthUser user, @PathVariable String orderNumber) {
        return orders.get(user.id(), orderNumber);
    }

    @PostMapping("/{orderNumber}/cancel")
    public OrderDto cancel(@AuthenticationPrincipal AuthUser user, @PathVariable String orderNumber) {
        return orders.cancel(user.id(), orderNumber);
    }
}
