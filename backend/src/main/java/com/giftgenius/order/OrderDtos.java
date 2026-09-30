package com.giftgenius.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import com.giftgenius.catalog.ProductDtos.SellerRef;
import com.giftgenius.pricing.DeliveryType;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class OrderDtos {

    private OrderDtos() {
    }

    public record ShippingRequest(
            @NotBlank(message = "Enter the recipient's name") @Size(max = 120) String fullName,
            @NotBlank(message = "Enter an email") @Email(message = "Enter a valid email") String email,
            @NotBlank(message = "Enter a phone number")
            @Pattern(regexp = "^[+0-9 ()-]{10,20}$", message = "Enter a valid phone number") String phone,
            @NotBlank(message = "Enter the delivery address") @Size(max = 300) String addressLine,
            @NotBlank(message = "Enter the city") @Size(max = 80) String city,
            @Size(max = 80) String state,
            @NotBlank(message = "Enter the pincode")
            @Pattern(regexp = "^[1-9][0-9]{5}$", message = "Enter a 6-digit pincode") String pincode) {
    }

    public record PlaceOrderRequest(
            @NotNull @Valid ShippingRequest shipping,
            @NotNull DeliveryType deliveryType,
            @NotNull PaymentMethod paymentMethod,
            @Size(max = 40) String couponCode) {
    }

    public record VerifyPaymentRequest(
            @NotBlank String razorpayOrderId,
            @NotBlank String razorpayPaymentId,
            @NotBlank String razorpaySignature) {
    }

    public record StatusUpdateRequest(@NotNull OrderStatus status, @Size(max = 255) String note) {
    }

    /** seller and fulfilment are set only for a line sold by a marketplace seller. */
    public record OrderItemDto(Long productId, String name, String image, BigDecimal unitPrice, int quantity,
            BigDecimal lineTotal, String customName, String customMessage, SellerRef seller,
            FulfillmentStatus fulfillmentStatus, String fulfillmentNote) {
    }

    public record StatusEventDto(OrderStatus status, String note, Instant at) {
    }

    public record ShippingDto(String fullName, String email, String phone, String addressLine, String city,
            String state, String pincode) {
    }

    /** Present only while an online payment is still due; feeds Razorpay Checkout in the browser. */
    public record PaymentInstructions(String provider, String keyId, String razorpayOrderId, long amountPaise,
            String currency, String name, String email, String phone) {
    }

    public record OrderDto(
            String orderNumber,
            OrderStatus status,
            PaymentMethod paymentMethod,
            PaymentStatus paymentStatus,
            DeliveryType deliveryType,
            BigDecimal subtotal,
            BigDecimal discount,
            BigDecimal deliveryFee,
            BigDecimal total,
            String couponCode,
            ShippingDto shipping,
            List<OrderItemDto> items,
            List<StatusEventDto> timeline,
            Instant createdAt,
            PaymentInstructions payment) {
    }

    /** Public tracking view: no address or phone, only what's needed to follow the parcel. */
    public record TrackingDto(String orderNumber, OrderStatus status, PaymentMethod paymentMethod,
            PaymentStatus paymentStatus, DeliveryType deliveryType, BigDecimal total, String recipientFirstName, String city,
            List<OrderItemDto> items, List<StatusEventDto> timeline, Instant createdAt) {
    }

    /**
     * itemCount is the total quantity; lineCount is the number of different products in the order;
     * sellers names who sells its lines: marketplace stores, and "GiftGenius" for GiftGenius's own lines.
     */
    public record OrderSummaryDto(String orderNumber, OrderStatus status, PaymentMethod paymentMethod,
            PaymentStatus paymentStatus, BigDecimal total, int itemCount, int lineCount, String firstItemName,
            String firstItemImage, Instant createdAt, String customerEmail, List<String> sellers) {
    }
}
