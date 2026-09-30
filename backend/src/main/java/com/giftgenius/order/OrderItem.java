package com.giftgenius.order;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Snapshot of what was bought, at the price paid; later catalog edits don't rewrite history. */
@Entity
@Table(name = "order_items")
@Getter
@Setter
@NoArgsConstructor
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id")
    private Order order;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    /** The seller who fulfils this line (their user id), fixed when the order is placed; null for GiftGenius. */
    @Column(name = "seller_id")
    private Long sellerId;

    @Column(name = "product_name", nullable = false)
    private String productName;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "unit_price", nullable = false, precision = 10, scale = 2)
    private BigDecimal unitPrice;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "line_total", nullable = false, precision = 10, scale = 2)
    private BigDecimal lineTotal;

    @Column(name = "custom_name")
    private String customName;

    @Column(name = "custom_message")
    private String customMessage;

    /** Only for a seller's line. */
    @Enumerated(EnumType.STRING)
    @Column(name = "fulfillment_status")
    private FulfillmentStatus fulfillmentStatus;

    /** The seller's note to the customer, e.g. the courier and tracking number. */
    @Column(name = "fulfillment_note")
    private String fulfillmentNote;

    @Column(name = "fulfillment_updated_at")
    private Instant fulfillmentUpdatedAt;

    public boolean isSoldBy(Long seller) {
        return sellerId != null && sellerId.equals(seller);
    }

    public void setFulfillment(FulfillmentStatus status, String note) {
        this.fulfillmentStatus = status;
        if (note != null) {
            this.fulfillmentNote = note;
        }
        this.fulfillmentUpdatedAt = Instant.now();
    }
}
