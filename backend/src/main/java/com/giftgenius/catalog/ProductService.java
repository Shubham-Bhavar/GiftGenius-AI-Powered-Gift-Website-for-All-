package com.giftgenius.catalog;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.giftgenius.catalog.ProductDtos.CategoryDto;
import com.giftgenius.catalog.ProductDtos.ProductDto;
import com.giftgenius.catalog.ProductDtos.ProductUpsertRequest;
import com.giftgenius.common.ApiException;
import com.giftgenius.common.PageResponse;
import com.giftgenius.seller.SellerProfileRepository;

@Service
public class ProductService {

    public static final String CATALOG_CACHE = "catalog";

    /** {@code store} is a seller's public slug: only that store's products. */
    public record ProductQuery(String q, String category, String tag, String occasion,
            BigDecimal minPrice, BigDecimal maxPrice, String sort, String store) {
    }

    private final ProductRepository products;
    private final SellerProfileRepository sellers;
    private final CacheManager cacheManager;

    public ProductService(ProductRepository products, SellerProfileRepository sellers, CacheManager cacheManager) {
        this.products = products;
        this.sellers = sellers;
        this.cacheManager = cacheManager;
    }

    @Transactional(readOnly = true)
    public PageResponse<ProductDto> search(ProductQuery query, int page, int size) {
        Specification<Product> spec = Specification.allOf(
                ProductSpecifications.activeOnly(),
                ProductSpecifications.matchesText(query.q()),
                ProductSpecifications.inCategory(query.category()),
                ProductSpecifications.hasTag(query.tag()),
                ProductSpecifications.forOccasion(query.occasion()),
                ProductSpecifications.priceBetween(query.minPrice(), query.maxPrice()),
                ProductSpecifications.fromStore(query.store()));
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100), sortFor(query.sort()));
        return PageResponse.of(products.findAll(spec, pageable).map(ProductDto::from));
    }

    @Transactional(readOnly = true)
    public ProductDto get(Long id) {
        return products.findByIdAndActiveTrue(id).map(ProductDto::from)
                .orElseThrow(() -> ApiException.notFound("We couldn't find that gift."));
    }

    @Transactional(readOnly = true)
    public List<ProductDto> related(Long id, int limit) {
        Product base = products.findByIdAndActiveTrue(id)
                .orElseThrow(() -> ApiException.notFound("We couldn't find that gift."));
        Set<Product> picks = new LinkedHashSet<>(
                products.findTop8ByActiveTrueAndCategoryAndIdNotOrderByRatingDesc(base.getCategory(), id));
        if (picks.size() < limit) {
            picks.addAll(products.findTop8ByActiveTrueAndIdNotOrderByRatingDesc(id));
        }
        return picks.stream().limit(limit).map(ProductDto::from).toList();
    }

    @Transactional(readOnly = true)
    public List<CategoryDto> categories() {
        List<CategoryDto> out = new ArrayList<>();
        for (Object[] row : products.countByCategory()) {
            out.add(new CategoryDto((String) row[0], (Long) row[1]));
        }
        return out;
    }

    /** Purchasable catalog used by the recommendation engine. Cached; evicted on admin edits and every 5 min. */
    @Cacheable(CATALOG_CACHE)
    @Transactional(readOnly = true)
    public List<ProductDto> purchasableCatalog() {
        return products.findByActiveTrueAndStockGreaterThan(0).stream().map(ProductDto::from).toList();
    }

    /** Stock moves with every order, so refresh the recommendation catalog periodically. */
    @Scheduled(fixedDelay = 300_000, initialDelay = 300_000)
    public void evictCatalogCache() {
        Cache cache = cacheManager.getCache(CATALOG_CACHE);
        if (cache != null) {
            cache.clear();
        }
    }

    // ── Admin ──────────────────────────────────────────────

    /**
     * Every product, listed or not. {@code status} narrows to one review state (e.g. PENDING_APPROVAL: the
     * approval queue); {@code owner} is "platform" (GiftGenius's own), "marketplace" (sellers') or blank for all.
     */
    @Transactional(readOnly = true)
    public PageResponse<ProductDto> adminList(String q, ProductStatus status, String owner, int page, int size) {
        Specification<Product> spec = Specification.allOf(ProductSpecifications.matchesText(q),
                ProductSpecifications.withStatus(status), ProductSpecifications.ownerType(owner));
        Sort sort = status == ProductStatus.PENDING_APPROVAL ? Sort.by("updatedAt") : Sort.by("id");
        return PageResponse.of(products.findAll(spec,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100), sort)).map(ProductDto::from));
    }

    /** Any product, listed or not (the public lookup only finds listed ones). */
    @Transactional(readOnly = true)
    public ProductDto adminGet(Long id) {
        return products.findById(id).map(ProductDto::from).orElseThrow(() -> ApiException.notFound("Product not found."));
    }

    @Transactional
    @CacheEvict(value = CATALOG_CACHE, allEntries = true)
    public ProductDto create(ProductUpsertRequest req) {
        Product p = new Product();
        p.setSlug(uniqueSlug(req.name()));
        apply(p, req);
        return ProductDto.from(products.save(p));
    }

    @Transactional
    @CacheEvict(value = CATALOG_CACHE, allEntries = true)
    public ProductDto update(Long id, ProductUpsertRequest req) {
        Product p = products.findById(id).orElseThrow(() -> ApiException.notFound("Product not found."));
        if (p.getSeller() != null) {
            sellers.lockById(p.getSeller().getUserId()); // the listing decision below reads the store's latest status
        }
        apply(p, req);
        return ProductDto.from(p);
    }

    /** Takes a product off the shop. A seller's product is archived, so relisting it needs a fresh approval. */
    @Transactional
    @CacheEvict(value = CATALOG_CACHE, allEntries = true)
    public void deactivate(Long id) {
        Product p = products.findById(id).orElseThrow(() -> ApiException.notFound("Product not found."));
        if (p.getSeller() != null) {
            p.setStatus(ProductStatus.ARCHIVED);
            p.syncListing();
        } else {
            p.setActive(false);
        }
    }

    private void apply(Product p, ProductUpsertRequest r) {
        if (r.originalPrice().compareTo(r.price()) < 0) {
            throw ApiException.badRequest("Original price can't be lower than the sale price.");
        }
        p.setName(r.name().trim());
        p.setCategory(r.category().trim().toLowerCase());
        p.setDescription(r.description().trim());
        p.setLongDescription(r.longDescription());
        p.setPrice(r.price());
        p.setOriginalPrice(r.originalPrice());
        if (r.rating() != null) {
            p.setRating(r.rating());
        }
        if (r.reviewCount() != null) {
            p.setReviewCount(r.reviewCount());
        }
        p.setImageUrl(r.image().trim());
        p.setAltText(r.alt());
        p.setBadgeText(r.badgeText());
        p.setBadgeClass(r.badgeClass());
        p.setStock(r.stock());
        if (p.getSeller() != null) {
            // A seller's product is listed by approving it, not by ticking "visible".
            p.syncListing();
        } else if (r.active() != null) {
            p.setActive(r.active());
        }
        if (r.isCultural() != null) {
            p.setCultural(r.isCultural());
        }
        if (r.isFestival() != null) {
            p.setFestival(r.isFestival());
        }
        replace(p.getTags(), r.tags());
        replace(p.getOccasions(), r.occasion());
        replace(p.getForWhom(), r.forWhom());
        replace(p.getPersonalities(), r.personality());
        replace(p.getRelationships(), r.relationship());
    }

    private static void replace(Set<String> target, Set<String> values) {
        if (values == null) {
            return;
        }
        target.clear();
        target.addAll(values.stream().filter(v -> v != null && !v.isBlank())
                .map(v -> v.trim().toLowerCase()).collect(Collectors.toCollection(LinkedHashSet::new)));
    }

    String uniqueSlug(String name) {
        String base = name.toLowerCase().replace("&", "and").replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        if (base.isEmpty()) {
            base = "gift";
        }
        String slug = base;
        int n = 2;
        while (products.existsBySlug(slug)) {
            slug = base + "-" + n++;
        }
        return slug;
    }

    private static Sort sortFor(String sort) {
        if (sort == null) {
            return Sort.by("id");
        }
        return switch (sort) {
            case "price_asc", "price-asc" -> Sort.by("price").ascending();
            case "price_desc", "price-desc" -> Sort.by("price").descending();
            case "rating" -> Sort.by("rating").descending().and(Sort.by("reviewCount").descending());
            case "newest" -> Sort.by("createdAt").descending();
            default -> Sort.by("id");
        };
    }
}
