package com.giftgenius.wishlist;

import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.catalog.ProductDtos.ProductDto;
import com.giftgenius.security.AuthUser;

import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/wishlist")
public class WishlistController {

    public record MergeRequest(@Size(max = 100) List<Long> productIds) {
    }

    private final WishlistService wishlist;

    public WishlistController(WishlistService wishlist) {
        this.wishlist = wishlist;
    }

    @GetMapping
    public List<ProductDto> list(@AuthenticationPrincipal AuthUser user) {
        return wishlist.list(user.id());
    }

    @PutMapping("/{productId}")
    public List<ProductDto> add(@AuthenticationPrincipal AuthUser user, @PathVariable Long productId) {
        return wishlist.add(user.id(), productId);
    }

    @DeleteMapping("/{productId}")
    public List<ProductDto> remove(@AuthenticationPrincipal AuthUser user, @PathVariable Long productId) {
        return wishlist.remove(user.id(), productId);
    }

    @PostMapping("/merge")
    public List<ProductDto> merge(@AuthenticationPrincipal AuthUser user, @RequestBody MergeRequest req) {
        return wishlist.merge(user.id(), req.productIds());
    }
}
