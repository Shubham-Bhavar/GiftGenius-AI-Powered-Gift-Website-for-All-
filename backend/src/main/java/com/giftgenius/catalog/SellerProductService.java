package com.giftgenius.catalog;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.giftgenius.catalog.ProductDtos.ProductDto;
import com.giftgenius.catalog.ProductDtos.SellerProductRequest;
import com.giftgenius.common.ApiException;
import com.giftgenius.common.PageResponse;
import com.giftgenius.common.SafeText;
import com.giftgenius.config.AppProperties;
import com.giftgenius.notify.Mailer;
import com.giftgenius.seller.SellerProfile;
import com.giftgenius.seller.SellerProfileRepository;
import com.giftgenius.seller.SellerStatus;

/**
 * Sellers' products, and admin review of them.
 *
 * <p>Ownership: a product's seller is set once, from the signed-in seller, when it is created. Every seller
 * operation loads the product and checks that owner (403 for someone else's product, 404 for none), so changing
 * an id in the URL or body can never reach another seller's product.
 *
 * <p>Review: sellers save drafts and submit them; only an admin moves a product to APPROVED, which lists it.
 * Changing the name, descriptions, category or image of an approved product sends it back for review; price,
 * stock, tags and occasions change straight away.
 */
@Service
public class SellerProductService {

    /** The shop's categories; sellers pick one of these. */
    public static final List<String> CATEGORIES = List.of("accessories", "cultural", "flowers", "food & sweets",
            "fragrance", "gift sets", "home decor", "personalized", "wellness");
    /** The occasions the shop can be browsed by. */
    public static final List<String> OCCASIONS = List.of("birthday", "anniversary", "festival", "graduation",
            "valentine", "baby", "achievement");

    private final ProductRepository products;
    private final SellerProfileRepository sellers;
    private final ProductService productService;
    private final Mailer mailer;
    private final String publicUrl;

    public SellerProductService(ProductRepository products, SellerProfileRepository sellers,
            ProductService productService, Mailer mailer, AppProperties properties) {
        this.products = products;
        this.sellers = sellers;
        this.productService = productService;
        this.mailer = mailer;
        String url = properties.publicUrl();
        this.publicUrl = url != null && url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    // ── Seller ─────────────────────────────────────────────

    /** {@code status} is a ProductStatus or OUT_OF_STOCK (approved but none left). */
    @Transactional(readOnly = true)
    public PageResponse<ProductDto> list(Long sellerId, String q, String status, String category, String sort,
            int page, int size) {
        Specification<Product> byStatus;
        if ("OUT_OF_STOCK".equalsIgnoreCase(status)) {
            byStatus = ProductSpecifications.withStatus(ProductStatus.APPROVED).and(ProductSpecifications.outOfStock());
        } else {
            byStatus = ProductSpecifications.withStatus(parseStatus(status));
        }
        Specification<Product> spec = Specification.allOf(ProductSpecifications.ownedBy(sellerId),
                ProductSpecifications.matchesText(q), ProductSpecifications.inCategory(category), byStatus);
        PageRequest pr = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 50), sortFor(sort));
        return PageResponse.of(products.findAll(spec, pr).map(ProductDto::from));
    }

    @Transactional(readOnly = true)
    public ProductDto get(Long sellerId, Long id) {
        return ProductDto.from(owned(sellerId, id));
    }

    @Transactional
    @CacheEvict(value = ProductService.CATALOG_CACHE, allEntries = true)
    public ProductDto create(Long sellerId, SellerProductRequest req) {
        SellerProfile seller = store(sellerId);
        requireCanEdit(seller);
        if (req.submit()) {
            requireCanSubmit(seller);
        }
        Product p = new Product();
        p.setSeller(seller);
        p.setSlug(productService.uniqueSlug(req.name()));
        apply(p, req);
        p.setStatus(req.submit() ? ProductStatus.PENDING_APPROVAL : ProductStatus.DRAFT);
        p.syncListing();
        return ProductDto.from(products.save(p));
    }

    @Transactional
    @CacheEvict(value = ProductService.CATALOG_CACHE, allEntries = true)
    public ProductDto update(Long sellerId, Long id, SellerProductRequest req) {
        Product p = owned(sellerId, id);
        SellerProfile seller = store(sellerId);
        requireCanEdit(seller);
        boolean contentChanged = !Objects.equals(p.getName(), req.name().trim())
                || !Objects.equals(p.getDescription(), req.description().trim())
                || !Objects.equals(p.getLongDescription(), SafeText.clean(req.longDescription()))
                || !Objects.equals(p.getCategory(), category(req.category()))
                || !Objects.equals(p.getImageUrl(), req.image().trim());
        apply(p, req);
        if (req.submit()) {
            requireCanSubmit(seller);
            if (p.getStatus() != ProductStatus.APPROVED || contentChanged) {
                toReview(p);
            }
        } else if (p.getStatus() == ProductStatus.APPROVED && contentChanged) {
            toReview(p); // what shoppers see changed: it needs a fresh approval
        }
        p.syncListing();
        return ProductDto.from(p);
    }

    /** Sends a draft, rejected or archived product for review. */
    @Transactional
    public ProductDto submit(Long sellerId, Long id) {
        Product p = owned(sellerId, id);
        requireCanSubmit(store(sellerId));
        if (p.getStatus() == ProductStatus.PENDING_APPROVAL || p.getStatus() == ProductStatus.APPROVED) {
            throw ApiException.conflict(p.getStatus() == ProductStatus.APPROVED
                    ? "This product is already approved." : "This product is already waiting for approval.");
        }
        toReview(p);
        p.syncListing();
        return ProductDto.from(p);
    }

    /**
     * "Delete" for sellers: the product leaves the shop and is kept as ARCHIVED, because past orders refer to it.
     * Allowed whatever the store's status, so a seller can always take their products down.
     */
    @Transactional
    @CacheEvict(value = ProductService.CATALOG_CACHE, allEntries = true)
    public void archive(Long sellerId, Long id) {
        Product p = owned(sellerId, id);
        p.setStatus(ProductStatus.ARCHIVED);
        p.syncListing();
    }

    // ── Admin review ───────────────────────────────────────

    @Transactional
    @CacheEvict(value = ProductService.CATALOG_CACHE, allEntries = true)
    public ProductDto approve(Long id) {
        Product p = marketplaceProduct(id);
        if (p.getStatus() != ProductStatus.PENDING_APPROVAL) {
            throw ApiException.conflict("Only products waiting for approval can be approved.");
        }
        p.setStatus(ProductStatus.APPROVED);
        p.setRejectionReason(null);
        p.syncListing();
        SellerProfile s = p.getSeller();
        mailer.send(s.getUser().getEmail(), "Approved: " + p.getName(), """
                Hi %s,

                Good news: "%s" is approved%s.

                Manage your products: %s/seller/products

                — GiftGenius Seller Center
                """.formatted(s.getStoreName(), p.getName(),
                        p.isActive() ? " and now listed in the GiftGenius shop" : "", publicUrl));
        return ProductDto.from(p);
    }

    /** Rejects a product waiting for approval, or takes an approved one down, with a reason the seller sees. */
    @Transactional
    @CacheEvict(value = ProductService.CATALOG_CACHE, allEntries = true)
    public ProductDto reject(Long id, String reason) {
        Product p = marketplaceProduct(id);
        if (p.getStatus() != ProductStatus.PENDING_APPROVAL && p.getStatus() != ProductStatus.APPROVED) {
            throw ApiException.conflict("Only products waiting for approval or listed in the shop can be rejected.");
        }
        p.setStatus(ProductStatus.REJECTED);
        p.setRejectionReason(reason.trim());
        p.syncListing();
        SellerProfile s = p.getSeller();
        mailer.send(s.getUser().getEmail(), "Changes needed: " + p.getName(), """
                Hi %s,

                "%s" wasn't approved for the GiftGenius shop:

                %s

                You can edit it and submit it again: %s/seller/products/%d/edit

                — GiftGenius Seller Center
                """.formatted(s.getStoreName(), p.getName(), p.getRejectionReason(), publicUrl, p.getId()));
        return ProductDto.from(p);
    }

    // ── Internals ──────────────────────────────────────────

    /** The product, if it belongs to this seller: 404 if there is no such product, 403 if it is someone else's. */
    private Product owned(Long sellerId, Long id) {
        Product p = products.findById(id).orElseThrow(() -> ApiException.notFound("Product not found."));
        if (!p.isOwnedBy(sellerId)) {
            throw ApiException.forbidden("You can only manage your own products.");
        }
        return p;
    }

    private SellerProfile store(Long sellerId) {
        return sellers.findById(sellerId).orElseThrow(() -> ApiException.forbidden("Set up your store first."));
    }

    private Product marketplaceProduct(Long id) {
        Product p = products.findById(id).orElseThrow(() -> ApiException.notFound("Product not found."));
        if (p.getSeller() == null) {
            throw ApiException.conflict("GiftGenius's own products don't need approval.");
        }
        return p;
    }

    private static void requireCanEdit(SellerProfile seller) {
        switch (seller.getStatus()) {
            case PENDING, APPROVED -> {
            }
            case REJECTED -> throw ApiException.forbidden("Your seller application wasn't approved, so products "
                    + "can't be added or changed. Update your store details and apply again.");
            case SUSPENDED -> throw ApiException.forbidden("Your store is suspended, so products can't be added or "
                    + "changed. Contact GiftGenius support.");
        }
    }

    private static void requireCanSubmit(SellerProfile seller) {
        if (seller.getStatus() == SellerStatus.PENDING) {
            throw ApiException.forbidden("Your store is still being reviewed. Save products as drafts: you can "
                    + "submit them for approval once your store is approved.");
        }
        requireCanEdit(seller);
    }

    private static void toReview(Product p) {
        p.setStatus(ProductStatus.PENDING_APPROVAL);
        p.setRejectionReason(null);
    }

    private static void apply(Product p, SellerProductRequest r) {
        if (r.compareAtPrice() != null && r.compareAtPrice().compareTo(r.price()) < 0) {
            throw ApiException.badRequest("The compare-at price can't be lower than the price.");
        }
        p.setName(r.name().trim());
        p.setDescription(r.description().trim());
        p.setLongDescription(SafeText.clean(r.longDescription()));
        p.setCategory(category(r.category()));
        p.setPrice(r.price());
        p.setOriginalPrice(r.compareAtPrice() != null ? r.compareAtPrice() : r.price());
        p.setStock(r.stock());
        p.setImageUrl(SafeText.httpsUrl(r.image(), "Image"));
        p.setAltText(SafeText.clean(r.alt()));
        replace(p.getOccasions(), allowed(r.occasion(), OCCASIONS, "occasion"));
        replace(p.getTags(), r.tags() == null ? null : r.tags().stream().filter(t -> t != null && !t.isBlank())
                .map(t -> t.trim().toLowerCase(Locale.ROOT)).collect(Collectors.toCollection(LinkedHashSet::new)));
    }

    private static String category(String raw) {
        String c = raw.trim().toLowerCase(Locale.ROOT);
        if (!CATEGORIES.contains(c)) {
            throw ApiException.badRequest("Choose one of the shop's categories.");
        }
        return c;
    }

    private static Set<String> allowed(Set<String> values, List<String> options, String what) {
        if (values == null) {
            return null;
        }
        Set<String> out = new LinkedHashSet<>();
        for (String v : values) {
            if (v == null || v.isBlank()) {
                continue;
            }
            String x = v.trim().toLowerCase(Locale.ROOT);
            if (!options.contains(x)) {
                throw ApiException.badRequest("Unknown " + what + ": choose from the list.");
            }
            out.add(x);
        }
        return out;
    }

    private static void replace(Set<String> target, Set<String> values) {
        if (values == null) {
            return;
        }
        target.clear();
        target.addAll(values);
    }

    private static ProductStatus parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return ProductStatus.valueOf(status.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Unknown product status.");
        }
    }

    private static Sort sortFor(String sort) {
        return switch (sort == null ? "" : sort) {
            case "oldest" -> Sort.by("createdAt").ascending();
            case "name" -> Sort.by("name").ascending();
            case "price_asc" -> Sort.by("price").ascending();
            case "price_desc" -> Sort.by("price").descending();
            case "stock" -> Sort.by("stock").ascending();
            default -> Sort.by("createdAt").descending().and(Sort.by("id").descending());
        };
    }
}
