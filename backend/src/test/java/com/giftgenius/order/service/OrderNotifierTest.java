package com.giftgenius.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.giftgenius.TestProps;
import com.giftgenius.notify.EmailKind;
import com.giftgenius.notify.EmailOutbox;
import com.giftgenius.order.model.FulfillmentStatus;
import com.giftgenius.order.model.Order;
import com.giftgenius.order.model.OrderItem;
import com.giftgenius.order.model.OrderStatus;
import com.giftgenius.order.model.PaymentMethod;
import com.giftgenius.order.model.ShippingAddress;
import com.giftgenius.seller.model.SellerProfile;
import com.giftgenius.seller.repository.SellerProfileRepository;
import com.giftgenius.user.User;

class OrderNotifierTest {

    private final EmailOutbox outbox = mock(EmailOutbox.class);
    private final SellerProfileRepository sellers = mock(SellerProfileRepository.class);
    private final OrderNotifier notifier = new OrderNotifier(outbox, sellers, TestProps.defaults());

    private static OrderItem item(String name, Long sellerId) {
        OrderItem i = new OrderItem();
        i.setProductName(name);
        i.setQuantity(1);
        i.setSellerId(sellerId);
        i.setCustomName("Meera");
        return i;
    }

    private static Order order() {
        Order o = new Order();
        o.setId(42L);
        o.setOrderNumber("GG-TEST-42");
        o.setPaymentMethod(PaymentMethod.COD);
        o.setTotal(new BigDecimal("1499.00"));
        ShippingAddress ship = new ShippingAddress();
        ship.setFullName("Asha Rao");
        ship.setEmail("asha.rao@example.com");
        ship.setPhone("+91 98765 43210");
        ship.setAddressLine("12 MG Road");
        ship.setCity("Pune");
        ship.setState("Maharashtra");
        ship.setPincode("411001");
        o.setShipping(ship);
        o.addItem(item("Candle", 7L));
        o.addItem(item("Mug", 8L));
        o.addItem(item("Chocolate Box", null));
        return o;
    }

    private static SellerProfile seller(long userId, String store, String email) {
        User u = new User();
        u.setId(userId);
        u.setEmail(email);
        SellerProfile s = new SellerProfile();
        s.setUserId(userId);
        s.setUser(u);
        s.setStoreName(store);
        s.setPhone("+91 90000 00000");
        return s;
    }

    @Test
    void theConfirmationIsQueuedForTheCustomerUnderOneKeyPerOrder() {
        notifier.customer(order(), OrderNotifier.CONFIRMED, "Your order is confirmed", "Thank you!");
        verify(outbox).enqueue(eq("order:42:confirmed:customer"), eq(EmailKind.ORDER_CONFIRMED), eq(42L),
                eq("asha.rao@example.com"), eq("Your order is confirmed"), anyString());
    }

    @Test
    void eachStatusHasItsOwnKeySoEveryStatusIsEmailedOnce() {
        notifier.customer(order(), OrderNotifier.status(OrderStatus.SHIPPED), "Update", "On its way");
        notifier.customer(order(), OrderNotifier.status(OrderStatus.CANCELLED), "Cancelled", "Cancelled");
        verify(outbox).enqueue(eq("order:42:status:SHIPPED:customer"), eq(EmailKind.ORDER_STATUS), eq(42L),
                anyString(), anyString(), anyString());
        verify(outbox).enqueue(eq("order:42:status:CANCELLED:customer"), eq(EmailKind.ORDER_STATUS), eq(42L),
                anyString(), anyString(), anyString());
    }

    @Test
    void eachSellerGetsOnlyTheirLinesAndNothingAboutTheCustomer() {
        when(sellers.findAllById(any())).thenReturn(List.of(seller(7, "Wax & Wick", "wick@example.com"),
                seller(8, "Clay Co", "clay@example.com")));
        notifier.sellers(order());

        ArgumentCaptor<String> keys = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> to = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> bodies = ArgumentCaptor.forClass(String.class);
        verify(outbox, times(2)).enqueue(keys.capture(), eq(EmailKind.ORDER_NEW_FOR_SELLER), eq(42L), to.capture(),
                anyString(), bodies.capture());
        assertThat(keys.getAllValues()).containsExactly("order:42:confirmed:seller:7", "order:42:confirmed:seller:8");
        assertThat(to.getAllValues()).containsExactly("wick@example.com", "clay@example.com");
        String wick = bodies.getAllValues().get(0);
        assertThat(wick).contains("Candle").doesNotContain("Mug").doesNotContain("Chocolate");
        for (String body : bodies.getAllValues()) {
            assertThat(body).doesNotContain("Asha").doesNotContain("asha.rao").doesNotContain("98765")
                    .doesNotContain("MG Road").doesNotContain("Pune").doesNotContain("411001")
                    .doesNotContain("Maharashtra");
        }
    }

    @Test
    void aPartShippedUpdateIsKeyedBySellerAndStep() {
        SellerProfile wick = seller(7, "Wax & Wick", "wick@example.com");
        Order o = order();
        notifier.partialShipment(o, wick, List.of(o.getItems().get(0)), FulfillmentStatus.SHIPPED, null);
        notifier.partialShipment(o, wick, List.of(o.getItems().get(0)), FulfillmentStatus.DELIVERED, null);
        verify(outbox).enqueue(eq("order:42:seller:7:SHIPPED:customer"), eq(EmailKind.ORDER_PART_SHIPPED), eq(42L),
                eq("asha.rao@example.com"), anyString(), anyString());
        verify(outbox).enqueue(eq("order:42:seller:7:DELIVERED:customer"), eq(EmailKind.ORDER_PART_SHIPPED), eq(42L),
                eq("asha.rao@example.com"), anyString(), anyString());
    }

    // ── An email that can't be built never fails the order ──

    @Test
    void anEmailWhoseContentCantBeBuiltIsSkippedAndCountedNeverThrown() {
        Order o = order();
        o.setShipping(null); // the template needs the customer's name and address
        assertThatCode(() -> notifier.customer(o, OrderNotifier.CONFIRMED, "Confirmed", "Thank you"))
                .doesNotThrowAnyException();
        assertThatCode(() -> notifier.partialShipment(o, seller(7, "Wax & Wick", "wick@example.com"), o.getItems(),
                FulfillmentStatus.SHIPPED, null)).doesNotThrowAnyException();
        verify(outbox, never()).enqueue(anyString(), any(), any(), anyString(), anyString(), anyString());
        verify(outbox, times(2)).countFailure(EmailOutbox.Failure.CONTENT);
    }

    @Test
    void oneSellersBrokenEmailDoesntStopTheOthers() {
        SellerProfile broken = seller(7, "Wax & Wick", "wick@example.com");
        broken.setUser(null);
        when(sellers.findAllById(any())).thenReturn(List.of(broken, seller(8, "Clay Co", "clay@example.com")));
        assertThatCode(() -> notifier.sellers(order())).doesNotThrowAnyException();
        verify(outbox).enqueue(eq("order:42:confirmed:seller:8"), eq(EmailKind.ORDER_NEW_FOR_SELLER), eq(42L),
                eq("clay@example.com"), anyString(), anyString());
        verify(outbox, never()).enqueue(eq("order:42:confirmed:seller:7"), any(), any(), any(), any(), any());
        verify(outbox).countFailure(EmailOutbox.Failure.CONTENT);
    }

    @Test
    void anUnexpectedErrorWhileQueueingIsContainedToo() {
        doThrow(new IllegalStateException("boom")).when(outbox).enqueue(anyString(), any(), any(), anyString(),
                anyString(), anyString());
        assertThatCode(() -> notifier.customer(order(), OrderNotifier.status(OrderStatus.SHIPPED), "Update", "On its way"))
                .doesNotThrowAnyException();
        verify(outbox).countFailure(EmailOutbox.Failure.CONTENT);
    }
}
