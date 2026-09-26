package com.giftgenius.cart;

import java.math.BigDecimal;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class CartDtos {

    private CartDtos() {
    }

    public record AddItemRequest(
            @NotNull Long productId,
            @Min(1) @Max(10) int quantity,
            @Size(max = 80) String customName,
            @Size(max = 300) String customMessage) {
    }

    public record UpdateQuantityRequest(@Min(1) @Max(10) int quantity) {
    }

    public record MergeRequest(@Size(max = 50) List<@Valid AddItemRequest> items) {
    }

    public record CartItemDto(
            Long id,
            Long productId,
            String name,
            String image,
            BigDecimal unitPrice,
            int quantity,
            BigDecimal lineTotal,
            String customName,
            String customMessage,
            int stock,
            boolean available) {
    }

    public record CartDto(List<CartItemDto> items, int itemCount, BigDecimal subtotal) {
    }
}
