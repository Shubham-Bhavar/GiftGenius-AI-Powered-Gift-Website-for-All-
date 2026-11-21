package com.giftgenius.order.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.giftgenius.order.model.FulfillmentStatus;
import com.giftgenius.order.model.Order;
import com.giftgenius.order.model.OrderItem;
import com.giftgenius.order.model.OrderStatus;
import com.giftgenius.order.model.PaymentMethod;
import com.giftgenius.order.model.PaymentStatus;
import com.giftgenius.pricing.model.DeliveryType;

/** What the order emails say, in both bodies, and what they must never contain. */
class OrderEmailsTest {

    private static final Instant NOW = Instant.parse("2026-11-10T04:30:00Z");
    private final OrderEmails emails = new OrderEmails("https://shop.example", ZoneId.of("Asia/Kolkata"));

    private static Order order() {
        return OrderNotifierTest.order();
    }

    /** Both bodies of an email, for checks that apply to each. */
    private static List<String> bodies(OrderEmails.Content c) {
        return List.of(c.text(), c.html());
    }

    // ── Customer ──

    @Test
    void theConfirmationCarriesTheOrderItsItemsAmountsStatusTimesAndWhereItIsGoing() {
        OrderEmails.Content c = emails.customer(order(), "Your GiftGenius order GG-TEST-42 is confirmed",
                "Thank you! Your order is confirmed and we're getting it ready.", true, NOW);
        assertThat(c.subject()).isEqualTo("Your GiftGenius order GG-TEST-42 is confirmed");
        for (String body : bodies(c)) {
            assertThat(body).contains("Hi Asha,").contains("GG-TEST-42")
                    .contains("9 Nov 2026, 3:45 pm IST").as("status and payment").contains("Confirmed")
                    .contains("Cash on delivery")
                    .as("items").contains("Candle × 1").contains("Mug × 1").contains("Chocolate Box × 1")
                    .contains("₹499.00").contains("Personalised for Meera")
                    .as("amounts").contains("₹1,497.00").contains("Discount (WELCOME)").contains("−₹100.00")
                    .contains("Standard delivery").contains("₹102.00").contains("₹1,499.00")
                    .as("delivery details").contains("Asha Rao").contains("12 MG Road").contains("Pune, Maharashtra 411001")
                    .contains("+91 98765 43210")
                    .contains("https://shop.example/track?order=GG-TEST-42");
        }
        assertThat(c.text()).contains("Thank you! Your order is confirmed and we're getting it ready.")
                .doesNotContain("<");
        assertThat(c.html()).startsWith("<!DOCTYPE html>").contains("GiftGenius")
                .contains("we&#39;re getting it ready").contains("href=\"https://shop.example/track?order=GG-TEST-42\"");
    }

    @Test
    void freeDeliveryNoDiscountAndAnOnlinePaymentAreWordedPlainly() {
        Order o = order();
        o.setDiscount(BigDecimal.ZERO);
        o.setCouponCode(null);
        o.setDeliveryFee(BigDecimal.ZERO);
        o.setDeliveryType(DeliveryType.EXPRESS);
        o.setPaymentMethod(PaymentMethod.ONLINE);
        o.setPaymentStatus(PaymentStatus.PAID);
        o.getShipping().setState(null);
        o.setCreatedAt(null); // not yet assigned: the time of sending stands in
        OrderEmails.Content c = emails.customer(o, "Paid", "We've received your payment.", true, NOW);
        for (String body : bodies(c)) {
            assertThat(body).contains("Paid online").contains("Express delivery").contains("Free")
                    .doesNotContain("Discount").doesNotContain("cash on delivery").contains("Pune 411001")
                    .contains("10 Nov 2026, 10:00 am IST");
        }
    }

    @Test
    void aStatusUpdateShowsTheNewStatusAndWhenWithoutTheAddressOrBreakdown() {
        Order o = order();
        o.setStatus(OrderStatus.SHIPPED);
        OrderEmails.Content c = emails.customer(o, "Update on your GiftGenius order GG-TEST-42",
                "Your order is on its way.", false, NOW);
        for (String body : bodies(c)) {
            assertThat(body).contains("Your order is on its way.").contains("Shipped")
                    .contains("9 Nov 2026, 3:45 pm IST").as("when it changed").contains("10 Nov 2026, 10:00 am IST")
                    .contains("Candle × 1").contains("₹1,499.00")
                    .doesNotContain("12 MG Road").doesNotContain("98765").doesNotContain("Subtotal");
        }
    }

    @Test
    void aCancelledPaidOrderSaysTheRefundIsInProgress() {
        Order o = order();
        o.setStatus(OrderStatus.CANCELLED);
        o.setPaymentMethod(PaymentMethod.ONLINE);
        o.setPaymentStatus(PaymentStatus.REFUND_PENDING);
        OrderEmails.Content c = emails.customer(o, "Cancelled", "Your order is cancelled.", false, NOW);
        for (String body : bodies(c)) {
            assertThat(body).contains("Cancelled").contains("Refund in progress");
        }
    }

    @Test
    void aPartShipmentNamesTheStoreItsItemsAndTheSellersNote() {
        Order o = order();
        OrderEmails.Content c = emails.partialShipment(o, "Wax & Wick", List.of(o.getItems().get(0)),
                FulfillmentStatus.SHIPPED, "Tracking: BLUEDART 12345", NOW);
        assertThat(c.subject()).isEqualTo("Update on your GiftGenius order GG-TEST-42");
        assertThat(c.text()).contains("Part of your order is on its way, sent by Wax & Wick:").contains("Candle × 1")
                .contains("Tracking: BLUEDART 12345").contains("GG-TEST-42").doesNotContain("Mug");
        assertThat(c.html()).contains("sent by Wax &amp; Wick:").contains("Candle × 1")
                .contains("Tracking: BLUEDART 12345").doesNotContain("Mug");
        OrderEmails.Content delivered = emails.partialShipment(o, "Wax & Wick", List.of(o.getItems().get(0)),
                FulfillmentStatus.DELIVERED, null, NOW);
        assertThat(delivered.text()).contains("Part of your order has been delivered").doesNotContain("null");
        assertThat(delivered.html()).doesNotContain("Note from");
    }

    // ── Seller ──

    @Test
    void aSellerGetsTheirLinesAndHowToStartButNothingAboutTheCustomerOrTheWording() {
        Order o = order();
        o.getItems().get(0).setCustomMessage("Happy birthday, love from Asha");
        OrderEmails.Content c = emails.seller(o, "Wax & Wick", List.of(o.getItems().get(0)), NOW);
        assertThat(c.subject()).isEqualTo("New GiftGenius order GG-TEST-42");
        for (String body : bodies(c)) {
            assertThat(body).contains("GG-TEST-42").contains("Candle × 1").contains("9 Nov 2026, 3:45 pm IST")
                    .contains("Standard delivery").contains("This order has personalisation")
                    .contains("https://shop.example/seller/orders/GG-TEST-42")
                    .as("nothing about the customer").doesNotContain("Asha").doesNotContain("asha.rao")
                    .doesNotContain("98765").doesNotContain("MG Road").doesNotContain("Pune")
                    .doesNotContain("411001").doesNotContain("Maharashtra")
                    .as("nor the personalisation wording, the order's money or other sellers' lines")
                    .doesNotContain("Meera").doesNotContain("Happy birthday").doesNotContain("1,499")
                    .doesNotContain("WELCOME").doesNotContain("Mug").doesNotContain("Chocolate");
        }
        assertThat(c.text()).contains("Hi Wax & Wick,");
        assertThat(c.html()).contains("Hi Wax &amp; Wick,");
    }

    @Test
    void aSellerEmailWithoutPersonalisationDoesntMentionIt() {
        Order o = order();
        OrderItem plain = o.getItems().get(1);
        plain.setCustomName(null);
        OrderEmails.Content c = emails.seller(o, "Clay Co", List.of(plain), NOW);
        for (String body : bodies(c)) {
            assertThat(body).contains("Mug × 1").doesNotContain("personalisation");
        }
    }

    // ── Owner ──

    @Test
    void theOwnerGetsTheOrderWithTheCustomersNameEmailAndCityButNotTheirPhoneOrStreet() {
        OrderEmails.Content c = emails.owner(order(), Map.of(7L, "Wax & Wick"), NOW);
        assertThat(c.subject()).isEqualTo("New GiftGenius order GG-TEST-42 (₹1,499.00)");
        for (String body : bodies(c)) {
            assertThat(body).contains("GG-TEST-42").contains("9 Nov 2026, 3:45 pm IST").contains("Confirmed")
                    .contains("Cash on delivery").contains("Standard delivery").contains("WELCOME")
                    .contains("Asha Rao").contains("asha.rao@example.com").contains("Pune")
                    .contains("Candle × 1").contains("Sold by GiftGenius").contains("a marketplace seller")
                    .contains("₹1,499.00").contains("https://shop.example/admin/orders")
                    .as("no phone, street, state or PIN code").doesNotContain("98765").doesNotContain("MG Road")
                    .doesNotContain("411001").doesNotContain("Maharashtra")
                    .as("no personalisation wording").doesNotContain("Meera");
        }
        assertThat(c.text()).contains("Sold by Wax & Wick");
        assertThat(c.html()).contains("Sold by Wax &amp; Wick");
    }

    // ── HTML safety ──

    @Test
    void peoplesTextIsEscapedInTheHtmlAndLeftAloneInTheText() {
        Order o = order();
        o.getShipping().setFullName("<b>Asha</b> \"Rao\"");
        o.getShipping().setAddressLine("12 <script>alert(1)</script> Road");
        o.getItems().get(0).setProductName("Candle <img src=x onerror=alert(1)>");
        o.getItems().get(0).setCustomName("Meera & <i>Co</i>");
        String headline = "Thank you <3";
        List<OrderEmails.Content> all = List.of(
                emails.customer(o, "Order <GG>", headline, true, NOW),
                emails.seller(o, "Wax <script>x</script>", List.of(o.getItems().get(0)), NOW),
                emails.owner(o, Map.of(7L, "Wax <script>x</script>"), NOW),
                emails.partialShipment(o, "Wax <script>x</script>", List.of(o.getItems().get(0)),
                        FulfillmentStatus.SHIPPED, "<a href=\"https://evil.example\">click</a>", NOW));
        for (OrderEmails.Content c : all) {
            assertThat(c.html()).doesNotContain("<script").doesNotContain("<img").doesNotContain("<b>")
                    .doesNotContain("<i>").doesNotContain("<a href=\"https://evil.example\"")
                    .doesNotContain("onerror=alert(1)>");
        }
        OrderEmails.Content customer = all.get(0);
        assertThat(customer.html()).contains("&lt;b&gt;Asha&lt;/b&gt;").contains("&lt;script&gt;alert(1)&lt;/script&gt;")
                .contains("Candle &lt;img src=x onerror=alert(1)&gt;").contains("Meera &amp; &lt;i&gt;Co&lt;/i&gt;")
                .contains("Thank you &lt;3").contains("<title>Order &lt;GG&gt;</title>");
        assertThat(customer.text()).contains("Candle <img src=x onerror=alert(1)>").contains("Thank you <3");
    }

    @Test
    void anOrderNumberIsEncodedInLinks() {
        Order o = order();
        o.setOrderNumber("GG A&B\"");
        OrderEmails.Content c = emails.customer(o, "S", "H", true, NOW);
        assertThat(c.text()).contains("https://shop.example/track?order=GG+A%26B%22");
        assertThat(c.html()).contains("href=\"https://shop.example/track?order=GG+A%26B%22\"");
    }

    @Test
    void moneyUsesIndianGroupingAndTwoDecimals() {
        assertThat(OrderEmails.money(new BigDecimal("1234567.5"))).isEqualTo("₹12,34,567.50");
        assertThat(OrderEmails.money(new BigDecimal("499"))).isEqualTo("₹499.00");
        assertThat(OrderEmails.money(new BigDecimal("0.005"))).isEqualTo("₹0.01");
        assertThat(OrderEmails.money(null)).isEqualTo("₹0.00");
        assertThat(OrderEmails.money(new BigDecimal("1000"))).isEqualTo("₹1,000.00");
        assertThat(OrderEmails.money(new BigDecimal("100000"))).isEqualTo("₹1,00,000.00");
        assertThat(OrderEmails.money(new BigDecimal("99999.999"))).isEqualTo("₹1,00,000.00");
        assertThat(OrderEmails.money(new BigDecimal("123456789"))).isEqualTo("₹12,34,56,789.00");
        assertThat(OrderEmails.money(new BigDecimal("-250"))).isEqualTo("−₹250.00");
    }

    @Test
    void everyStatusHasAReadableLabel() {
        for (OrderStatus s : OrderStatus.values()) {
            assertThat(OrderEmails.statusLabel(s)).isNotBlank().doesNotContain("_");
        }
    }
}
