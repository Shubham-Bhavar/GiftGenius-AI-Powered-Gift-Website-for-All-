package com.giftgenius.order;

import java.util.Arrays;
import java.util.List;

/**
 * A seller's progress on their own lines of an order. The customer's order keeps its {@link OrderStatus};
 * when every line of an order belongs to sellers, the order status follows the slowest seller.
 * GiftGenius's own lines have no fulfilment status: they follow the order status, which admins set.
 */
public enum FulfillmentStatus {
    NEW,
    PACKED,
    SHIPPED,
    DELIVERED,
    CANCELLED;

    /** The steps a seller may take. Cancelling is for the customer or GiftGenius, never the seller. */
    public boolean canMoveTo(FulfillmentStatus next) {
        return switch (this) {
            case NEW -> next == PACKED || next == SHIPPED;
            case PACKED -> next == SHIPPED;
            case SHIPPED -> next == DELIVERED;
            case DELIVERED, CANCELLED -> false;
        };
    }

    public List<FulfillmentStatus> nextSteps() {
        return Arrays.stream(values()).filter(this::canMoveTo).toList();
    }

    public boolean hasShipped() {
        return this == SHIPPED || this == DELIVERED;
    }
}
