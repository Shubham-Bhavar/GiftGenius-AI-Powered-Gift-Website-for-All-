package com.giftgenius.order;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.common.PageResponse;
import com.giftgenius.order.OrderDtos.OrderDto;
import com.giftgenius.order.OrderDtos.OrderSummaryDto;
import com.giftgenius.order.OrderDtos.StatusUpdateRequest;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/admin/orders")
public class AdminOrderController {

    private final OrderService orders;

    public AdminOrderController(OrderService orders) {
        this.orders = orders;
    }

    /** status accepts one or more comma-separated values, e.g. CONFIRMED,PACKED ("to pack and ship"). */
    @GetMapping
    public PageResponse<OrderSummaryDto> list(@RequestParam(required = false) List<OrderStatus> status,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return orders.adminList(status, page, size);
    }

    @GetMapping("/{orderNumber}")
    public OrderDto get(@PathVariable String orderNumber) {
        return orders.adminGet(orderNumber);
    }

    @PatchMapping("/{orderNumber}/status")
    public OrderDto updateStatus(@PathVariable String orderNumber, @Valid @RequestBody StatusUpdateRequest req) {
        return orders.adminUpdateStatus(orderNumber, req);
    }
}
