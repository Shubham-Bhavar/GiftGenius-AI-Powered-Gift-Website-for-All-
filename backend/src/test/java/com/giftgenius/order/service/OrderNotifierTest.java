package com.giftgenius.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.giftgenius.TestProps;
import com.giftgenius.config.AppProperties;
import com.giftgenius.notify.EmailKind;
import com.giftgenius.notify.EmailOutbox;
import com.giftgenius.order.model.FulfillmentStatus;
import com.giftgenius.order.model.Order;
import com.giftgenius.order.model.OrderItem;
import com.giftgenius.order.model.OrderStatus;
import com.giftgenius.order.model.PaymentMethod;
import com.giftgenius.order.model.PaymentStatus;
import com.giftgenius.order.model.ShippingAddress;
import com.giftgenius.pricing.model.DeliveryType;
import com.giftgenius.seller.model.SellerProfile;
import com.giftgenius.seller.repository.SellerProfileRepository;
import com.giftgenius.user.User;

/**
 * Which order emails are queued, for whom and under which key; that sellers learn nothing about the customer; who the
 * owner's email goes to; and that an email which can't be built never fails the order. The wording is in
 * {@link OrderEmailsTest}.
 */
class OrderNotifierTest {

    private final EmailOutbox outbox = mock(EmailOutbox.class);
    private final SellerProfileRepository sellers = mock(SellerProfileRepository.class);
    private final OrderNotifier notifier = new OrderNotifier(outbox, sellers, props(List.of(), "owner@example.com"));

    /** Test settings with these owner notification addresses and this admin account address. */
    static AppProperties props(List<String> notify, String adminEmail) {
        AppProperties d = TestProps.defaults();
        return new AppProperties(d.publicUrl(), d.security(), d.ai(), d.payment(), d.shipping(),
                adminEmail == null ? null : new AppProperties.Admin(adminEmail, "not-used-here", "Owner"),
                d.rateLimit(), d.orders(),
                new AppProperties.Mail(d.mail().from(), d.mail().outbox(), notify, "Asia/Kolkata"), d.geo());
    }

    static OrderItem item(String name, Long sellerId) {
        OrderItem i = new OrderItem();
        i.setProductName(name);
        i.setQuantity(1);
        i.setUnitPrice(new BigDecimal("499.00"));
        i.setLineTotal(new BigDecimal("499.00"));
        i.setSellerId(sellerId);
        i.setCustomName("Meera");
        return i;
    }

    static Order order() {
        Order o = new Order();
        o.setId(42L);
        o.setOrderNumber("GG-TEST-42");
        o.setStatus(OrderStatus.CONFIRMED);
        o.setPaymentMethod(PaymentMethod.COD);
        o.setPaymentStatus(PaymentStatus.PENDING);
        o.setDeliveryType(DeliveryType.STANDARD);
        o.setSubtotal(new BigDecimal("1497.00"));
        o.setDiscount(new BigDecimal("100.00"));
        o.setCouponCode("WELCOME");
        o.setDeliveryFee(new BigDecimal("102.00"));
        o.setTotal(new BigDecimal("1499.00"));
        o.setCreatedAt(Instant.parse("2026-11-09T10:15:00Z"));
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

    static SellerProfile seller(long userId, String store, String email) {
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

    // ── To the customer ──

    @Test
    void theConfirmationIsQueuedForTheCustomerUnderOneKeyPerOrderWithTextAndHtml() {
        notifier.customer(order(), OrderNotifier.CONFIRMED, "Your order is confirmed", "Thank you!");
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> html = ArgumentCaptor.forClass(String.class);
        verify(outbox).enqueue(eq("order:42:confirmed:customer"), eq(EmailKind.ORDER_CONFIRMED), eq(42L),
                eq("asha.rao@example.com"), eq("Your order is confirmed"), text.capture(), html.capture());
        assertThat(text.getValue()).contains("Thank you!").contains("GG-TEST-42");
        assertThat(html.getValue()).startsWith("<!DOCTYPE html>").contains("Thank you!").contains("GG-TEST-42");
    }

    @Test
    void eachStatusHasItsOwnKeySoEveryStatusIsEmailedOnce() {
        notifier.customer(order(), OrderNotifier.status(OrderStatus.SHIPPED), "Update", "On its way");
        notifier.customer(order(), OrderNotifier.status(OrderStatus.CANCELLED), "Cancelled", "Cancelled");
        verify(outbox).enqueue(eq("order:42:status:SHIPPED:customer"), eq(EmailKind.ORDER_STATUS), eq(42L),
                anyString(), anyString(), anyString(), anyString());
        verify(outbox).enqueue(eq("order:42:status:CANCELLED:customer"), eq(EmailKind.ORDER_STATUS), eq(42L),
                anyString(), anyString(), anyString(), anyString());
    }

    // ── To sellers ──

    @Test
    void eachSellerGetsOnlyTheirLinesAndNothingAboutTheCustomer() {
        when(sellers.findAllById(any())).thenReturn(List.of(seller(7, "Wax & Wick", "wick@example.com"),
                seller(8, "Clay Co", "clay@example.com")));
        notifier.sellers(order());

        ArgumentCaptor<String> keys = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> to = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> texts = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> htmls = ArgumentCaptor.forClass(String.class);
        verify(outbox, times(2)).enqueue(keys.capture(), eq(EmailKind.ORDER_NEW_FOR_SELLER), eq(42L), to.capture(),
                anyString(), texts.capture(), htmls.capture());
        assertThat(keys.getAllValues()).containsExactly("order:42:confirmed:seller:7", "order:42:confirmed:seller:8");
        assertThat(to.getAllValues()).containsExactly("wick@example.com", "clay@example.com");
        assertThat(texts.getAllValues().get(0)).contains("Candle").doesNotContain("Mug").doesNotContain("Chocolate");
        assertThat(htmls.getAllValues().get(0)).contains("Candle").doesNotContain("Mug").doesNotContain("Chocolate");
        List<String> bodies = new ArrayList<>(texts.getAllValues());
        bodies.addAll(htmls.getAllValues());
        for (String body : bodies) {
            assertThat(body).doesNotContain("Asha").doesNotContain("asha.rao").doesNotContain("98765")
                    .doesNotContain("MG Road").doesNotContain("Pune").doesNotContain("411001")
                    .doesNotContain("Maharashtra").as("the personalisation wording stays in the Seller Center")
                    .doesNotContain("Meera");
        }
    }

    @Test
    void aPartShippedUpdateIsKeyedBySellerAndStep() {
        SellerProfile wick = seller(7, "Wax & Wick", "wick@example.com");
        Order o = order();
        notifier.partialShipment(o, wick, List.of(o.getItems().get(0)), FulfillmentStatus.SHIPPED, null);
        notifier.partialShipment(o, wick, List.of(o.getItems().get(0)), FulfillmentStatus.DELIVERED, null);
        verify(outbox).enqueue(eq("order:42:seller:7:SHIPPED:customer"), eq(EmailKind.ORDER_PART_SHIPPED), eq(42L),
                eq("asha.rao@example.com"), anyString(), anyString(), anyString());
        verify(outbox).enqueue(eq("order:42:seller:7:DELIVERED:customer"), eq(EmailKind.ORDER_PART_SHIPPED), eq(42L),
                eq("asha.rao@example.com"), anyString(), anyString(), anyString());
    }

    // ── To the owner ──

    @Test
    void theOwnerIsToldAtTheAdminAddressWhenNoNotificationAddressIsConfigured() {
        when(sellers.findAllById(any())).thenReturn(List.of(seller(7, "Wax & Wick", "wick@example.com"),
                seller(8, "Clay Co", "clay@example.com")));
        notifier.owner(order());
        ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(outbox).enqueue(key.capture(), eq(EmailKind.ORDER_NEW_FOR_OWNER), eq(42L), eq("owner@example.com"),
                eq("New GiftGenius order GG-TEST-42 (₹1,499.00)"), text.capture(), anyString());
        assertThat(key.getValue()).matches("order:42:confirmed:owner:[0-9a-f]{16}").doesNotContain("owner@");
        assertThat(text.getValue()).contains("Asha Rao <asha.rao@example.com>, Pune").contains("Wax & Wick")
                .contains("Clay Co").contains("Sold by GiftGenius");
    }

    @Test
    void configuredNotificationAddressesReplaceTheAdminAddressEachUnderItsOwnKey() {
        OrderNotifier configured = new OrderNotifier(outbox, sellers,
                props(List.of("ops@example.com", " Sales@Example.com ", "ops@EXAMPLE.com", "", "not-an-address"),
                        "owner@example.com"));
        when(sellers.findAllById(any())).thenReturn(List.of());
        configured.owner(order());
        ArgumentCaptor<String> keys = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> to = ArgumentCaptor.forClass(String.class);
        verify(outbox, times(2)).enqueue(keys.capture(), eq(EmailKind.ORDER_NEW_FOR_OWNER), eq(42L), to.capture(),
                anyString(), anyString(), anyString());
        assertThat(to.getAllValues()).containsExactly("ops@example.com", "Sales@Example.com");
        assertThat(keys.getAllValues()).doesNotHaveDuplicates();
    }

    @Test
    void ownerAddressesAreCleanedDeduplicatedAndCapped() {
        assertThat(OrderNotifier.ownerAddresses(null, "owner@example.com")).containsExactly("owner@example.com");
        assertThat(OrderNotifier.ownerAddresses(List.of(), null)).isEmpty();
        assertThat(OrderNotifier.ownerAddresses(Arrays.asList(null, " ", "@nobody", "nobody@", "a b@example.com",
                "x@example.com,y@example.com", "<x@example.com>"), " ")).isEmpty();
        assertThat(OrderNotifier.ownerAddresses(List.of("only-junk"), "owner@example.com"))
                .as("junk in the list falls back to the admin address").containsExactly("owner@example.com");
        List<String> many = new ArrayList<>();
        for (int i = 0; i < 25; i++) {
            many.add("ops" + i + "@example.com");
        }
        assertThat(OrderNotifier.ownerAddresses(many, null)).hasSize(OrderNotifier.MAX_OWNER_ADDRESSES)
                .startsWith("ops0@example.com");
    }

    @Test
    void withNoOwnerAddressAtAllNothingIsQueuedAndNothingFails() {
        OrderNotifier none = new OrderNotifier(outbox, sellers, props(List.of(), null));
        assertThatCode(() -> none.owner(order())).doesNotThrowAnyException();
        verify(outbox, never()).enqueue(anyString(), any(), any(), anyString(), anyString(), anyString(), any());
        verify(outbox, never()).countFailure(any());
    }

    @Test
    void anUnknownTimeZoneFallsBackToIndia() {
        AppProperties d = props(List.of(), "owner@example.com");
        AppProperties odd = new AppProperties(d.publicUrl(), d.security(), d.ai(), d.payment(), d.shipping(), d.admin(),
                d.rateLimit(), d.orders(),
                new AppProperties.Mail(d.mail().from(), d.mail().outbox(), List.of(), "Mars/Olympus"), d.geo());
        new OrderNotifier(outbox, sellers, odd).customer(order(), OrderNotifier.CONFIRMED, "Confirmed", "Thank you");
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(outbox).enqueue(anyString(), any(), any(), anyString(), anyString(), text.capture(), anyString());
        assertThat(text.getValue()).contains("9 Nov 2026, 3:45 pm IST");
    }

    // ── An email that can't be built never fails the order ──

    @Test
    void anEmailWhoseContentCantBeBuiltIsSkippedAndCountedNeverThrown() {
        Order o = order();
        o.setShipping(null); // the templates need the customer's name and address
        assertThatCode(() -> notifier.customer(o, OrderNotifier.CONFIRMED, "Confirmed", "Thank you"))
                .doesNotThrowAnyException();
        assertThatCode(() -> notifier.partialShipment(o, seller(7, "Wax & Wick", "wick@example.com"), o.getItems(),
                FulfillmentStatus.SHIPPED, null)).doesNotThrowAnyException();
        when(sellers.findAllById(any())).thenReturn(List.of());
        assertThatCode(() -> notifier.owner(o)).doesNotThrowAnyException();
        verify(outbox, never()).enqueue(anyString(), any(), any(), anyString(), anyString(), anyString(), any());
        verify(outbox, times(3)).countFailure(EmailOutbox.Failure.CONTENT);
    }

    @Test
    void oneSellersBrokenEmailDoesntStopTheOthers() {
        SellerProfile broken = seller(7, "Wax & Wick", "wick@example.com");
        broken.setUser(null);
        when(sellers.findAllById(any())).thenReturn(List.of(broken, seller(8, "Clay Co", "clay@example.com")));
        assertThatCode(() -> notifier.sellers(order())).doesNotThrowAnyException();
        verify(outbox).enqueue(eq("order:42:confirmed:seller:8"), eq(EmailKind.ORDER_NEW_FOR_SELLER), eq(42L),
                eq("clay@example.com"), anyString(), anyString(), anyString());
        verify(outbox, never()).enqueue(eq("order:42:confirmed:seller:7"), any(), any(), any(), any(), any(), any());
        verify(outbox).countFailure(EmailOutbox.Failure.CONTENT);
    }

    @Test
    void anUnexpectedErrorWhileQueueingIsContainedToo() {
        doThrow(new IllegalStateException("boom")).when(outbox).enqueue(anyString(), any(), any(), anyString(),
                anyString(), anyString(), any());
        assertThatCode(() -> notifier.customer(order(), OrderNotifier.status(OrderStatus.SHIPPED), "Update", "On its way"))
                .doesNotThrowAnyException();
        when(sellers.findAllById(any())).thenReturn(List.of());
        assertThatCode(() -> notifier.owner(order())).doesNotThrowAnyException();
        verify(outbox, times(2)).countFailure(EmailOutbox.Failure.CONTENT);
    }

    @Test
    void anEmailTheOutboxCouldntQueueDoesntStopTheOthersOrFailTheOrder() {
        // EmailOutbox answers false for a statement-level database error (the order's transaction is intact).
        when(outbox.enqueue(anyString(), any(), any(), anyString(), anyString(), anyString(), any())).thenReturn(false);
        when(sellers.findAllById(any())).thenReturn(List.of(seller(7, "Wax & Wick", "wick@example.com"),
                seller(8, "Clay Co", "clay@example.com")));
        assertThatCode(() -> notifier.sellers(order())).doesNotThrowAnyException();
        verify(outbox, times(2)).enqueue(anyString(), eq(EmailKind.ORDER_NEW_FOR_SELLER), eq(42L), anyString(),
                anyString(), anyString(), anyString());
        verify(outbox, never()).countFailure(EmailOutbox.Failure.CONTENT);
    }

    // ── A failure of the order's database transaction is passed on, never taken for a content failure (GG-28) ──

    /** What Spring makes of a MySQL deadlock (error 1213, SQL state 40001): MySQL has rolled back the transaction. */
    static org.springframework.dao.CannotAcquireLockException deadlock() {
        return new org.springframework.dao.CannotAcquireLockException("Deadlock found when trying to get lock",
                new java.sql.SQLTransactionRollbackException("Deadlock found when trying to get lock", "40001", 1213));
    }

    private void outboxDeadlocks(RuntimeException e) {
        doThrow(e).when(outbox).enqueue(anyString(), any(), any(), anyString(), anyString(), anyString(), any());
    }

    @Test
    void aDeadlockWhileQueueingTheCustomersEmailIsPassedOn() {
        RuntimeException deadlock = deadlock();
        outboxDeadlocks(deadlock);
        assertThatThrownBy(() -> notifier.customer(order(), OrderNotifier.CONFIRMED, "Confirmed", "Thank you"))
                .isSameAs(deadlock);
        verify(outbox, never()).countFailure(EmailOutbox.Failure.CONTENT);
    }

    @Test
    void aDeadlockWhileQueueingASellersEmailIsPassedOnAndNoFurtherSellerIsTried() {
        RuntimeException deadlock = deadlock();
        outboxDeadlocks(deadlock);
        when(sellers.findAllById(any())).thenReturn(List.of(seller(7, "Wax & Wick", "wick@example.com"),
                seller(8, "Clay Co", "clay@example.com")));
        assertThatThrownBy(() -> notifier.sellers(order())).isSameAs(deadlock);
        verify(outbox, times(1)).enqueue(anyString(), any(), any(), anyString(), anyString(), anyString(), any());
        verify(outbox, never()).countFailure(EmailOutbox.Failure.CONTENT);
    }

    @Test
    void aDeadlockWhileQueueingTheOwnersEmailIsPassedOnAndNoFurtherAddressIsTried() {
        OrderNotifier twoOwners = new OrderNotifier(outbox, sellers,
                props(List.of("ops@example.com", "sales@example.com"), null));
        RuntimeException deadlock = deadlock();
        outboxDeadlocks(deadlock);
        when(sellers.findAllById(any())).thenReturn(List.of());
        assertThatThrownBy(() -> twoOwners.owner(order())).isSameAs(deadlock);
        verify(outbox, times(1)).enqueue(anyString(), any(), any(), anyString(), anyString(), anyString(), any());
        verify(outbox, never()).countFailure(EmailOutbox.Failure.CONTENT);
    }

    @Test
    void aDeadlockWhileQueueingAPartShippedEmailIsPassedOn() {
        RuntimeException deadlock = deadlock();
        outboxDeadlocks(deadlock);
        Order o = order();
        assertThatThrownBy(() -> notifier.partialShipment(o, seller(7, "Wax & Wick", "wick@example.com"),
                List.of(o.getItems().get(0)), FulfillmentStatus.SHIPPED, null)).isSameAs(deadlock);
        verify(outbox, never()).countFailure(EmailOutbox.Failure.CONTENT);
    }

    @Test
    void aJpaOrTransactionFailureWhileAnEmailIsBuiltIsPassedOnToo() {
        // A lazy load while building a seller's email: Hibernate's lock failure (a JPA PersistenceException).
        SellerProfile lazy = new SellerProfile() {
            @Override
            public User getUser() {
                throw new org.hibernate.exception.LockAcquisitionException("could not load the seller's account",
                        new java.sql.SQLTransactionRollbackException("Deadlock", "40001", 1213));
            }
        };
        lazy.setUserId(7L);
        lazy.setStoreName("Wax & Wick");
        when(sellers.findAllById(any())).thenReturn(List.of(lazy));
        assertThatThrownBy(() -> notifier.sellers(order()))
                .isInstanceOf(org.hibernate.exception.LockAcquisitionException.class);

        // Loading the order's lines (a lazy collection) failing in the database.
        Order unloadable = new Order() {
            @Override
            public List<OrderItem> getItems() {
                throw new org.hibernate.exception.LockAcquisitionException("could not load the order's lines",
                        new java.sql.SQLTransactionRollbackException("Deadlock", "40001", 1213));
            }
        };
        assertThatThrownBy(() -> notifier.sellers(unloadable))
                .isInstanceOf(org.hibernate.exception.LockAcquisitionException.class);

        // The owner's store-name lookup failing in the database.
        jakarta.persistence.PessimisticLockException lookup = new jakarta.persistence.PessimisticLockException("lock");
        when(sellers.findAllById(any())).thenThrow(lookup);
        assertThatThrownBy(() -> notifier.owner(order())).isSameAs(lookup);

        // The transaction already marked rollback-only.
        RuntimeException rollback = new org.springframework.transaction.UnexpectedRollbackException("rolled back");
        outboxDeadlocks(rollback);
        assertThatThrownBy(() -> notifier.customer(order(), OrderNotifier.CONFIRMED, "Confirmed", "Thank you"))
                .isSameAs(rollback);
        verify(outbox, never()).countFailure(EmailOutbox.Failure.CONTENT);
    }

    @Test
    void transactionFailuresAreToldApartFromContentFailures() {
        assertThat(OrderNotifier.isTransactionFailure(deadlock())).isTrue();
        assertThat(OrderNotifier.isTransactionFailure(new org.springframework.dao.DataIntegrityViolationException("x")))
                .isTrue();
        assertThat(OrderNotifier.isTransactionFailure(new jakarta.persistence.PersistenceException("x"))).isTrue();
        assertThat(OrderNotifier.isTransactionFailure(
                new org.springframework.transaction.TransactionSystemException("x"))).isTrue();
        assertThat(OrderNotifier.isTransactionFailure(new IllegalStateException("template bug"))).isFalse();
        assertThat(OrderNotifier.isTransactionFailure(new NullPointerException())).isFalse();
        assertThat(OrderNotifier.isTransactionFailure(new java.time.DateTimeException("x"))).isFalse();
        assertThat(OrderNotifier.isTransactionFailure(new IllegalArgumentException("x"))).isFalse();
    }
}
