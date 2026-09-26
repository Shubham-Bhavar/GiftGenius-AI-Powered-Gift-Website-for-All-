package com.giftgenius.wishlist;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.giftgenius.catalog.Product;
import com.giftgenius.catalog.ProductDtos.ProductDto;
import com.giftgenius.catalog.ProductRepository;
import com.giftgenius.common.ApiException;
import com.giftgenius.user.UserRepository;

@Service
public class WishlistService {

    private final WishlistRepository wishlist;
    private final ProductRepository products;
    private final UserRepository users;

    public WishlistService(WishlistRepository wishlist, ProductRepository products, UserRepository users) {
        this.wishlist = wishlist;
        this.products = products;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public List<ProductDto> list(Long userId) {
        return wishlist.findAllForUser(userId).stream()
                .map(WishlistItem::getProduct)
                .filter(Product::isActive)
                .map(ProductDto::from)
                .toList();
    }

    @Transactional
    public List<ProductDto> add(Long userId, Long productId) {
        users.lockById(userId); // serialise one shopper's writes (e.g. a double-clicked heart)
        addIfMissing(userId, productId);
        return list(userId);
    }

    @Transactional
    public List<ProductDto> remove(Long userId, Long productId) {
        wishlist.deleteForUser(userId, productId);
        return list(userId);
    }

    @Transactional
    public List<ProductDto> merge(Long userId, List<Long> productIds) {
        users.lockById(userId);
        if (productIds != null) {
            productIds.stream().distinct().limit(100).forEach(id -> {
                if (products.findByIdAndActiveTrue(id).isPresent()) {
                    addIfMissing(userId, id);
                }
            });
        }
        return list(userId);
    }

    private void addIfMissing(Long userId, Long productId) {
        Product product = products.findByIdAndActiveTrue(productId)
                .orElseThrow(() -> ApiException.notFound("That gift is no longer available."));
        if (!wishlist.existsByUserIdAndProductId(userId, productId)) {
            WishlistItem item = new WishlistItem();
            item.setUser(users.getReferenceById(userId));
            item.setProduct(product);
            wishlist.save(item);
        }
    }
}
