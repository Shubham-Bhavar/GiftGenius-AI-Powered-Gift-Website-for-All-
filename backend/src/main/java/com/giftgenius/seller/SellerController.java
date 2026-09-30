package com.giftgenius.seller;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.catalog.ProductDtos.ProductDto;
import com.giftgenius.catalog.ProductDtos.SellerProductRequest;
import com.giftgenius.catalog.SellerProductService;
import com.giftgenius.common.PageResponse;
import com.giftgenius.order.FulfillmentStatus;
import com.giftgenius.order.SellerOrderDtos.FulfillmentUpdateRequest;
import com.giftgenius.order.SellerOrderDtos.SellerOrderDto;
import com.giftgenius.order.SellerOrderDtos.SellerOrderSummary;
import com.giftgenius.order.SellerOrderService;
import com.giftgenius.security.AuthUser;
import com.giftgenius.seller.SellerDtos.AnalyticsDto;
import com.giftgenius.seller.SellerDtos.DashboardDto;
import com.giftgenius.seller.SellerDtos.StoreDto;
import com.giftgenius.seller.SellerDtos.StoreSettingsRequest;

import jakarta.validation.Valid;

/**
 * Seller Center API. Only SELLER accounts get here (SecurityConfig), and every call acts on the signed-in
 * seller's own store, products and order lines: the seller is always {@code user.id()}, never a request value.
 */
@RestController
@RequestMapping("/api/seller")
public class SellerController {

    private final SellerService sellers;
    private final SellerProductService products;
    private final SellerOrderService orders;

    public SellerController(SellerService sellers, SellerProductService products, SellerOrderService orders) {
        this.sellers = sellers;
        this.products = products;
        this.orders = orders;
    }

    // Store

    @GetMapping("/me")
    public StoreDto me(@AuthenticationPrincipal AuthUser user) {
        return sellers.store(user.id());
    }

    @PutMapping("/profile")
    public StoreDto updateProfile(@AuthenticationPrincipal AuthUser user, @Valid @RequestBody StoreSettingsRequest req) {
        return sellers.updateStore(user.id(), req);
    }

    @PostMapping("/profile/reapply")
    public StoreDto reapply(@AuthenticationPrincipal AuthUser user) {
        return sellers.reapply(user.id());
    }

    @GetMapping("/dashboard")
    public DashboardDto dashboard(@AuthenticationPrincipal AuthUser user) {
        return sellers.dashboard(user.id());
    }

    @GetMapping("/analytics")
    public AnalyticsDto analytics(@AuthenticationPrincipal AuthUser user) {
        return sellers.analytics(user.id());
    }

    // Products

    @GetMapping("/products")
    public PageResponse<ProductDto> products(@AuthenticationPrincipal AuthUser user,
            @RequestParam(required = false) String q, @RequestParam(required = false) String status,
            @RequestParam(required = false) String category, @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return products.list(user.id(), q, status, category, sort, page, size);
    }

    @PostMapping("/products")
    @ResponseStatus(HttpStatus.CREATED)
    public ProductDto create(@AuthenticationPrincipal AuthUser user, @Valid @RequestBody SellerProductRequest req) {
        return products.create(user.id(), req);
    }

    @GetMapping("/products/{id}")
    public ProductDto product(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return products.get(user.id(), id);
    }

    @PutMapping("/products/{id}")
    public ProductDto update(@AuthenticationPrincipal AuthUser user, @PathVariable Long id,
            @Valid @RequestBody SellerProductRequest req) {
        return products.update(user.id(), id, req);
    }

    @PostMapping("/products/{id}/submit")
    public ProductDto submit(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return products.submit(user.id(), id);
    }

    /** Archives the product: it leaves the shop but stays on past orders. */
    @DeleteMapping("/products/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void archive(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        products.archive(user.id(), id);
    }

    // Orders

    @GetMapping("/orders")
    public PageResponse<SellerOrderSummary> orders(@AuthenticationPrincipal AuthUser user,
            @RequestParam(required = false) FulfillmentStatus status,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return orders.list(user.id(), status, page, size);
    }

    @GetMapping("/orders/{orderNumber}")
    public SellerOrderDto order(@AuthenticationPrincipal AuthUser user, @PathVariable String orderNumber) {
        return orders.get(user.id(), orderNumber);
    }

    @PatchMapping("/orders/{orderNumber}/status")
    public SellerOrderDto updateStatus(@AuthenticationPrincipal AuthUser user, @PathVariable String orderNumber,
            @Valid @RequestBody FulfillmentUpdateRequest req) {
        return orders.updateFulfilment(user.id(), orderNumber, req);
    }
}
