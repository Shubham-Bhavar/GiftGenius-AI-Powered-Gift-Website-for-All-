package com.giftgenius.seller;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.hibernate.Hibernate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.giftgenius.catalog.ProductDtos.ProductDto;
import com.giftgenius.catalog.ProductRepository;
import com.giftgenius.catalog.ProductService;
import com.giftgenius.catalog.ProductStatus;
import com.giftgenius.catalog.SellerProductService;
import com.giftgenius.common.ApiException;
import com.giftgenius.common.PageResponse;
import com.giftgenius.common.SafeText;
import com.giftgenius.config.AppProperties;
import com.giftgenius.notify.Mailer;
import com.giftgenius.order.SellerOrderService;
import com.giftgenius.order.SellerOrderService.Sales;
import com.giftgenius.order.SellerOrderService.SellerTotals;
import com.giftgenius.seller.SellerDtos.AdminSellerDetail;
import com.giftgenius.seller.SellerDtos.AdminSellerSummary;
import com.giftgenius.seller.SellerDtos.AnalyticsDto;
import com.giftgenius.seller.SellerDtos.DashboardDto;
import com.giftgenius.seller.SellerDtos.PublicStoreDto;
import com.giftgenius.seller.SellerDtos.SellerApplication;
import com.giftgenius.seller.SellerDtos.SellerStats;
import com.giftgenius.seller.SellerDtos.StoreDto;
import com.giftgenius.seller.SellerDtos.StoreSettingsRequest;
import com.giftgenius.seller.SellerDtos.TopProduct;
import com.giftgenius.user.User;

/**
 * Stores: opening one, the seller's own settings and figures, admin review, and the public storefront.
 * Every seller-facing method takes the seller's id from the signed-in principal, never from the request.
 */
@Service
public class SellerService {

    private static final Logger log = LoggerFactory.getLogger(SellerService.class);

    private final SellerProfileRepository sellers;
    private final ProductRepository products;
    private final SellerOrderService sellerOrders;
    private final Mailer mailer;
    private final String publicUrl;
    private final String adminEmail;

    public SellerService(SellerProfileRepository sellers, ProductRepository products, SellerOrderService sellerOrders,
            Mailer mailer, AppProperties properties) {
        this.sellers = sellers;
        this.products = products;
        this.sellerOrders = sellerOrders;
        this.mailer = mailer;
        String url = properties.publicUrl();
        this.publicUrl = url != null && url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
        this.adminEmail = properties.admin() == null ? null : SafeText.clean(properties.admin().email());
    }

    // ── Opening a store ────────────────────────────────────

    /** Creates the store for a new or existing account, waiting for admin review. The caller sets the SELLER role. */
    @Transactional
    public SellerProfile open(User user, SellerApplication app) {
        if (sellers.existsById(user.getId())) {
            throw ApiException.conflict("You already have a store.");
        }
        String storeName = app.storeName().trim();
        if (sellers.existsByStoreNameIgnoreCase(storeName)) {
            throw ApiException.conflict("A store with that name already exists. Choose another name.");
        }
        SellerProfile s = new SellerProfile();
        s.setUser(user);
        s.setStoreName(storeName);
        s.setSlug(uniqueSlug(storeName));
        s.setDescription(SafeText.clean(app.description()));
        s.setBusinessCategory(businessCategory(app.businessCategory()));
        s.setPhone(app.phone().trim());
        s.setAddressLine(app.addressLine().trim());
        s.setCity(app.city().trim());
        s.setState(app.state().trim());
        s.setPincode(app.pincode().trim());
        s.setStatus(SellerStatus.PENDING);
        sellers.save(s);
        log.info("Seller application from user {} for store '{}'", user.getId(), s.getSlug());
        notifyAdmin(s, "New seller application: " + storeName);
        return s;
    }

    @Transactional(readOnly = true)
    public SellerStatus statusOf(Long userId) {
        return sellers.findById(userId).map(SellerProfile::getStatus).orElse(null);
    }

    /** The signed-in seller's store. A SELLER account always has one; anything else is refused. */
    @Transactional(readOnly = true)
    public SellerProfile require(Long userId) {
        return sellers.findById(userId).orElseThrow(() -> ApiException.forbidden("Set up your store first."));
    }

    // ── The seller's own store ─────────────────────────────

    @Transactional(readOnly = true)
    public StoreDto store(Long userId) {
        return StoreDto.from(require(userId));
    }

    /** Store settings. The store's status, owner and web address (slug) can't be changed here. */
    @Transactional
    @CacheEvict(value = ProductService.CATALOG_CACHE, allEntries = true)
    public StoreDto updateStore(Long userId, StoreSettingsRequest req) {
        SellerProfile s = require(userId);
        String storeName = req.storeName().trim();
        if (sellers.existsByStoreNameIgnoreCaseAndUserIdNot(storeName, userId)) {
            throw ApiException.conflict("A store with that name already exists. Choose another name.");
        }
        s.setStoreName(storeName);
        s.setDescription(SafeText.clean(req.description()));
        s.setBusinessCategory(businessCategory(req.businessCategory()));
        s.setPhone(req.phone().trim());
        s.setSupportEmail(SafeText.clean(req.supportEmail()));
        s.setAddressLine(req.addressLine().trim());
        s.setCity(req.city().trim());
        s.setState(req.state().trim());
        s.setPincode(req.pincode().trim());
        s.setLogoUrl(SafeText.httpsUrl(req.logoUrl(), "Logo"));
        s.setBannerUrl(SafeText.httpsUrl(req.bannerUrl(), "Banner"));
        return StoreDto.from(s);
    }

    /** A rejected seller who has updated their details asks for another review. */
    @Transactional
    public StoreDto reapply(Long userId) {
        SellerProfile s = require(userId);
        if (s.getStatus() != SellerStatus.REJECTED) {
            throw ApiException.conflict("Only a store that wasn't approved can apply again.");
        }
        s.setStatus(SellerStatus.PENDING);
        s.setStatusReason(null);
        notifyAdmin(s, "Seller application resubmitted: " + s.getStoreName());
        return StoreDto.from(s);
    }

    @Transactional(readOnly = true)
    public DashboardDto dashboard(Long userId) {
        SellerProfile s = require(userId);
        return new DashboardDto(StoreDto.from(s), stats(userId), sellerOrders.recent(userId, 5),
                products.findTop5BySellerUserIdOrderByUpdatedAtDesc(userId).stream().map(ProductDto::from).toList());
    }

    @Transactional(readOnly = true)
    public AnalyticsDto analytics(Long userId) {
        require(userId);
        List<TopProduct> top = sellerOrders.topProducts(userId, 5).stream()
                .map(t -> new TopProduct(t.productId(), t.name(), t.units(), t.sales())).toList();
        return new AnalyticsDto(stats(userId), top);
    }

    // ── Admin ──────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<AdminSellerSummary> adminList(SellerStatus status, String q, int page, int size) {
        String like = StringUtils.hasText(q)
                ? "%" + q.trim().toLowerCase(Locale.ROOT).replace("%", "\\%").replace("_", "\\_") + "%" : null;
        Page<SellerProfile> result = sellers.search(status, like,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100)));
        List<Long> ids = result.getContent().stream().map(SellerProfile::getUserId).toList();
        Map<Long, long[]> counts = new HashMap<>();
        if (!ids.isEmpty()) {
            for (Object[] row : products.countsBySeller(ids)) {
                counts.put((Long) row[0], new long[] { ((Number) row[1]).longValue(),
                        row[2] == null ? 0 : ((Number) row[2]).longValue() });
            }
        }
        Map<Long, SellerTotals> sales = sellerOrders.totalsBySeller(ids);
        return PageResponse.of(result.map(s -> {
            long[] c = counts.getOrDefault(s.getUserId(), new long[2]);
            SellerTotals t = sales.getOrDefault(s.getUserId(), new SellerTotals(0, BigDecimal.ZERO));
            return new AdminSellerSummary(s.getUserId(), s.getStoreName(), s.getSlug(), s.getUser().getFullName(),
                    s.getUser().getEmail(), s.getStatus(), c[0], c[1], t.orders(), t.gross(), s.getCreatedAt());
        }));
    }

    /** Everything about one store, except the account's password and tokens. */
    @Transactional(readOnly = true)
    public AdminSellerDetail adminGet(Long sellerId) {
        SellerProfile s = sellers.findById(sellerId).orElseThrow(() -> ApiException.notFound("Seller not found."));
        User u = s.getUser();
        return new AdminSellerDetail(s.getUserId(), u.getFullName(), u.getEmail(), u.getPhone(), u.isEnabled(),
                StoreDto.from(s), stats(sellerId),
                products.findTop50BySellerUserIdOrderByUpdatedAtDesc(sellerId).stream().map(ProductDto::from).toList(),
                sellerOrders.recent(sellerId, 10));
    }

    @Transactional
    @CacheEvict(value = ProductService.CATALOG_CACHE, allEntries = true)
    public AdminSellerDetail approve(Long sellerId) {
        SellerProfile s = adminFind(sellerId);
        if (s.getStatus() != SellerStatus.PENDING && s.getStatus() != SellerStatus.REJECTED) {
            throw ApiException.conflict("Only a store waiting for review can be approved.");
        }
        changeStatus(s, SellerStatus.APPROVED, null);
        mailer.send(s.getUser().getEmail(), "Your GiftGenius store is approved", """
                Hi %s,

                Welcome to GiftGenius! "%s" is approved. You can now submit products for review; approved products
                appear in the shop.

                Seller Center: %s/seller

                — GiftGenius Seller Center
                """.formatted(firstName(s), s.getStoreName(), publicUrl));
        return adminGet(sellerId);
    }

    @Transactional
    public AdminSellerDetail reject(Long sellerId, String reason) {
        SellerProfile s = adminFind(sellerId);
        if (s.getStatus() != SellerStatus.PENDING) {
            throw ApiException.conflict("Only a store waiting for review can be rejected.");
        }
        changeStatus(s, SellerStatus.REJECTED, reason.trim());
        mailer.send(s.getUser().getEmail(), "Your GiftGenius seller application", """
                Hi %s,

                We couldn't approve "%s" yet:

                %s

                You can update your store details and apply again: %s/seller/settings

                — GiftGenius Seller Center
                """.formatted(firstName(s), s.getStoreName(), s.getStatusReason(), publicUrl));
        return adminGet(sellerId);
    }

    /** Takes the store and all its products off the shop, keeping their review states for reactivation. */
    @Transactional
    @CacheEvict(value = ProductService.CATALOG_CACHE, allEntries = true)
    public AdminSellerDetail suspend(Long sellerId, String reason) {
        SellerProfile s = adminFind(sellerId);
        if (s.getStatus() != SellerStatus.APPROVED) {
            throw ApiException.conflict("Only an active store can be suspended.");
        }
        changeStatus(s, SellerStatus.SUSPENDED, reason.trim());
        mailer.send(s.getUser().getEmail(), "Your GiftGenius store is suspended", """
                Hi %s,

                "%s" is suspended and its products are hidden from the shop:

                %s

                Please contact GiftGenius support.

                — GiftGenius Seller Center
                """.formatted(firstName(s), s.getStoreName(), s.getStatusReason()));
        return adminGet(sellerId);
    }

    @Transactional
    @CacheEvict(value = ProductService.CATALOG_CACHE, allEntries = true)
    public AdminSellerDetail reactivate(Long sellerId) {
        SellerProfile s = adminFind(sellerId);
        if (s.getStatus() != SellerStatus.SUSPENDED) {
            throw ApiException.conflict("Only a suspended store can be reactivated.");
        }
        changeStatus(s, SellerStatus.APPROVED, null);
        mailer.send(s.getUser().getEmail(), "Your GiftGenius store is active again", """
                Hi %s,

                "%s" is active again, and its approved products are back in the shop.

                Seller Center: %s/seller

                — GiftGenius Seller Center
                """.formatted(firstName(s), s.getStoreName(), publicUrl));
        return adminGet(sellerId);
    }

    // ── Public storefront ──────────────────────────────────

    /** Only approved stores have a public page; nothing private (address, phone, email) is included. */
    @Transactional(readOnly = true)
    public PublicStoreDto publicStore(String slug) {
        SellerProfile s = sellers.findBySlug(slug.trim().toLowerCase(Locale.ROOT)).filter(SellerProfile::canSell)
                .orElseThrow(() -> ApiException.notFound("We couldn't find that store."));
        return new PublicStoreDto(s.getSlug(), s.getStoreName(), s.getDescription(), s.getBusinessCategory(),
                s.getLogoUrl(), s.getBannerUrl(), s.getCreatedAt(), products.countBySellerUserIdAndActiveTrue(s.getUserId()),
                products.listedCategoriesOf(s.getUserId()));
    }

    // ── Internals ──────────────────────────────────────────

    private SellerStats stats(Long sellerId) {
        Map<ProductStatus, Long> byStatus = new HashMap<>();
        for (Object[] row : products.countByStatusFor(sellerId)) {
            byStatus.put((ProductStatus) row[0], ((Number) row[1]).longValue());
        }
        long total = byStatus.values().stream().mapToLong(Long::longValue).sum();
        Sales sales = sellerOrders.sales(sellerId);
        BigDecimal aov = sales.orders() == 0 ? BigDecimal.ZERO
                : sales.gross().divide(BigDecimal.valueOf(sales.orders()), 2, RoundingMode.HALF_UP);
        return new SellerStats(total, products.countBySellerUserIdAndActiveTrue(sellerId),
                byStatus.getOrDefault(ProductStatus.PENDING_APPROVAL, 0L), byStatus.getOrDefault(ProductStatus.DRAFT, 0L),
                byStatus.getOrDefault(ProductStatus.REJECTED, 0L),
                products.countBySellerUserIdAndStatusAndStock(sellerId, ProductStatus.APPROVED, 0), sales.orders(),
                sales.units(), sales.gross(), aov, sales.cancelledOrders(), sales.ordersToFulfil());
    }

    /** Changes the store's status and lists or unlists its approved products to match. */
    private void changeStatus(SellerProfile s, SellerStatus status, String reason) {
        // Loaded now: the bulk update below clears the persistence context, and the emails need the account.
        Hibernate.initialize(s.getUser());
        s.setStatus(status);
        s.setStatusReason(reason);
        s.setReviewedAt(Instant.now());
        sellers.saveAndFlush(s);
        if (status == SellerStatus.APPROVED) {
            products.relistApprovedOf(s.getUserId());
        } else {
            products.unlistAllOf(s.getUserId());
        }
        log.info("Seller {} is now {}", s.getUserId(), status);
    }

    private SellerProfile adminFind(Long sellerId) {
        return sellers.findById(sellerId).orElseThrow(() -> ApiException.notFound("Seller not found."));
    }

    private void notifyAdmin(SellerProfile s, String subject) {
        if (adminEmail == null) {
            return;
        }
        mailer.send(adminEmail, subject, """
                A seller is waiting for review:

                Store: %s
                Category: %s
                City: %s, %s

                Review it in Store Admin → Sellers: %s/admin/sellers

                — GiftGenius
                """.formatted(s.getStoreName(), s.getBusinessCategory(), s.getCity(), s.getState(), publicUrl));
    }

    private String uniqueSlug(String storeName) {
        String base = SafeText.slugOf(storeName, "store");
        String slug = base;
        int n = 2;
        while (sellers.existsBySlug(slug)) {
            slug = base + "-" + n++;
        }
        return slug;
    }

    private static String businessCategory(String raw) {
        String c = raw.trim().toLowerCase(Locale.ROOT);
        if (!SellerProductService.CATEGORIES.contains(c)) {
            throw ApiException.badRequest("Choose one of the shop's categories.");
        }
        return c;
    }

    private static String firstName(SellerProfile s) {
        return s.getUser().getFullName().trim().split("\\s+")[0];
    }
}
