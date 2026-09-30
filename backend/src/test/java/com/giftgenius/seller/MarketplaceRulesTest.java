package com.giftgenius.seller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.giftgenius.catalog.Product;
import com.giftgenius.catalog.ProductStatus;
import com.giftgenius.common.ApiException;
import com.giftgenius.common.SafeText;
import com.giftgenius.order.FulfillmentStatus;

/** The small rules the marketplace rests on: listing, fulfilment steps, links and store addresses. */
class MarketplaceRulesTest {

    private static Product sellerProduct(SellerStatus store, ProductStatus status) {
        SellerProfile s = new SellerProfile();
        s.setUserId(25L);
        s.setStatus(store);
        Product p = new Product();
        p.setSeller(s);
        p.setStatus(status);
        p.syncListing();
        return p;
    }

    @Test
    void aSellersProductIsListedOnlyWhenApprovedAndTheStoreCanSell() {
        assertThat(sellerProduct(SellerStatus.APPROVED, ProductStatus.APPROVED).isActive()).isTrue();
        assertThat(sellerProduct(SellerStatus.APPROVED, ProductStatus.PENDING_APPROVAL).isActive()).isFalse();
        assertThat(sellerProduct(SellerStatus.APPROVED, ProductStatus.DRAFT).isActive()).isFalse();
        assertThat(sellerProduct(SellerStatus.APPROVED, ProductStatus.REJECTED).isActive()).isFalse();
        assertThat(sellerProduct(SellerStatus.APPROVED, ProductStatus.ARCHIVED).isActive()).isFalse();
        assertThat(sellerProduct(SellerStatus.SUSPENDED, ProductStatus.APPROVED).isActive()).isFalse();
        assertThat(sellerProduct(SellerStatus.PENDING, ProductStatus.APPROVED).isActive()).isFalse();
    }

    @Test
    void giftGeniusProductsKeepTheAdminsChoiceAndBelongToNoSeller() {
        Product own = new Product();
        own.setActive(false);
        own.syncListing();
        assertThat(own.isActive()).isFalse();
        own.setActive(true);
        own.syncListing();
        assertThat(own.isActive()).isTrue();
        assertThat(own.isOwnedBy(25L)).isFalse();
        assertThat(sellerProduct(SellerStatus.APPROVED, ProductStatus.DRAFT).isOwnedBy(25L)).isTrue();
        assertThat(sellerProduct(SellerStatus.APPROVED, ProductStatus.DRAFT).isOwnedBy(26L)).isFalse();
    }

    @Test
    void sellersMoveForwardOnlyAndNeverCancel() {
        assertThat(FulfillmentStatus.NEW.nextSteps()).containsExactly(FulfillmentStatus.PACKED, FulfillmentStatus.SHIPPED);
        assertThat(FulfillmentStatus.PACKED.nextSteps()).containsExactly(FulfillmentStatus.SHIPPED);
        assertThat(FulfillmentStatus.SHIPPED.nextSteps()).containsExactly(FulfillmentStatus.DELIVERED);
        assertThat(FulfillmentStatus.DELIVERED.nextSteps()).isEmpty();
        assertThat(FulfillmentStatus.CANCELLED.nextSteps()).isEmpty();
        assertThat(FulfillmentStatus.SHIPPED.canMoveTo(FulfillmentStatus.PACKED)).isFalse();
        assertThat(FulfillmentStatus.NEW.canMoveTo(FulfillmentStatus.CANCELLED)).isFalse();
    }

    @Test
    void imageLinksMustBeHttpsWithARealHost() {
        assertThat(SafeText.httpsUrl(" https://img.example.com/a.jpg ", "Image")).isEqualTo("https://img.example.com/a.jpg");
        assertThat(SafeText.httpsUrl("  ", "Image")).isNull();
        for (String bad : new String[] { "http://img.example.com/a.jpg", "javascript:alert(1)", "https://localhost/a.jpg",
                "https://user:pw@img.example.com/a.jpg", "data:image/png;base64,AAAA", "https://exa mple.com/a" }) {
            assertThatThrownBy(() -> SafeText.httpsUrl(bad, "Image")).as(bad).isInstanceOf(ApiException.class);
        }
    }

    @Test
    void storeAddressesAreReadableSlugs() {
        assertThat(SafeText.slugOf("Shubham's Gifts & Co.", "store")).isEqualTo("shubhams-gifts-and-co");
        assertThat(SafeText.slugOf("  !!!  ", "store")).isEqualTo("store");
        assertThat(SafeText.slugOf("x".repeat(90), "store")).hasSize(60);
    }
}
