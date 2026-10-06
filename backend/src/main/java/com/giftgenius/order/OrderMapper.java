package com.giftgenius.order;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.stereotype.Component;

import com.giftgenius.catalog.ProductDtos.SellerRef;
import com.giftgenius.common.PageResponse;
import com.giftgenius.order.OrderDtos.OrderDto;
import com.giftgenius.order.OrderDtos.OrderItemDto;
import com.giftgenius.order.OrderDtos.OrderSummaryDto;
import com.giftgenius.order.OrderDtos.PaymentInstructions;
import com.giftgenius.order.OrderDtos.ShippingDto;
import com.giftgenius.order.OrderDtos.StatusEventDto;
import com.giftgenius.order.OrderDtos.TrackingDto;
import com.giftgenius.seller.SellerProfile;
import com.giftgenius.seller.SellerProfileRepository;

/** Orders as the API shows them: to their customer, in lists, on the public tracking page and in Store Admin. */
@Component
public class OrderMapper {

    private static final String GIFTGENIUS = "GiftGenius";

    private final SellerProfileRepository sellers;
    private final OnlinePayments payments;

    public OrderMapper(SellerProfileRepository sellers, OnlinePayments payments) {
        this.sellers = sellers;
        this.payments = payments;
    }

    public OrderDto toDto(Order o) {
        ShippingAddress s = o.getShipping();
        PaymentInstructions pay = payments.instructionsFor(o);
        return new OrderDto(o.getOrderNumber(), o.getStatus(), o.getPaymentMethod(), o.getPaymentStatus(),
                o.getDeliveryType(), o.getSubtotal(), o.getDiscount(), o.getDeliveryFee(), o.getTotal(),
                o.getCouponCode(),
                new ShippingDto(s.getFullName(), s.getEmail(), s.getPhone(), s.getAddressLine(), s.getCity(),
                        s.getState(), s.getPincode()),
                items(o, sellerRefs(List.of(o))), timeline(o), o.getCreatedAt(), pay);
    }

    /** The public tracking view: no address beyond the city, first name only. */
    TrackingDto toTracking(Order o) {
        return new TrackingDto(o.getOrderNumber(), o.getStatus(), o.getPaymentMethod(), o.getPaymentStatus(),
                o.getDeliveryType(),
                o.getTotal(), firstName(o), o.getShipping().getCity(), items(o, sellerRefs(List.of(o))), timeline(o),
                o.getCreatedAt());
    }

    static String firstName(Order o) {
        return o.getShipping().getFullName().trim().split("\\s+")[0];
    }

    private static List<OrderItemDto> items(Order o, Map<Long, SellerRef> refs) {
        return o.getItems().stream().map(i -> new OrderItemDto(i.getProductId(), i.getProductName(),
                i.getImageUrl(), i.getUnitPrice(), i.getQuantity(), i.getLineTotal(), i.getCustomName(),
                i.getCustomMessage(), i.getSellerId() == null ? null : refs.get(i.getSellerId()),
                i.getFulfillmentStatus(), i.getFulfillmentNote())).toList();
    }

    /** Store names for the sellers in these orders, in one query. */
    private Map<Long, SellerRef> sellerRefs(Collection<Order> list) {
        Set<Long> ids = list.stream().flatMap(o -> o.getItems().stream()).map(OrderItem::getSellerId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return Map.of();
        }
        return sellers.findAllById(ids).stream()
                .collect(Collectors.toMap(SellerProfile::getUserId, SellerRef::from));
    }

    PageResponse<OrderSummaryDto> summaries(Page<Order> page) {
        Map<Long, SellerRef> refs = sellerRefs(page.getContent());
        return PageResponse.of(page.map(o -> toSummary(o, refs)));
    }

    private static List<StatusEventDto> timeline(Order o) {
        return o.getEvents().stream().map(e -> new StatusEventDto(e.getStatus(), e.getNote(), e.getCreatedAt()))
                .toList();
    }

    private static OrderSummaryDto toSummary(Order o, Map<Long, SellerRef> refs) {
        OrderItem first = o.getItems().isEmpty() ? null : o.getItems().get(0);
        int count = o.getItems().stream().mapToInt(OrderItem::getQuantity).sum();
        // Who sells the lines, in order: marketplace stores by name, GiftGenius for its own lines.
        List<String> storeNames = o.getItems().stream()
                .map(i -> i.getSellerId() == null ? GIFTGENIUS
                        : refs.containsKey(i.getSellerId()) ? refs.get(i.getSellerId()).storeName() : null)
                .filter(Objects::nonNull).distinct().toList();
        return new OrderSummaryDto(o.getOrderNumber(), o.getStatus(), o.getPaymentMethod(), o.getPaymentStatus(),
                o.getTotal(), count, o.getItems().size(),
                first == null ? null : first.getProductName(), first == null ? null : first.getImageUrl(),
                o.getCreatedAt(), o.getShipping().getEmail(), storeNames);
    }
}
