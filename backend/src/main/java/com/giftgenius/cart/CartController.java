package com.giftgenius.cart;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.cart.CartDtos.AddItemRequest;
import com.giftgenius.cart.CartDtos.CartDto;
import com.giftgenius.cart.CartDtos.MergeRequest;
import com.giftgenius.cart.CartDtos.UpdateQuantityRequest;
import com.giftgenius.security.AuthUser;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/cart")
public class CartController {

    private final CartService carts;

    public CartController(CartService carts) {
        this.carts = carts;
    }

    @GetMapping
    public CartDto get(@AuthenticationPrincipal AuthUser user) {
        return carts.get(user.id());
    }

    @PostMapping("/items")
    public CartDto add(@AuthenticationPrincipal AuthUser user, @Valid @RequestBody AddItemRequest req) {
        return carts.add(user.id(), req);
    }

    /** Called once after sign-in to fold the guest's local cart into their account cart. */
    @PostMapping("/merge")
    public CartDto merge(@AuthenticationPrincipal AuthUser user, @Valid @RequestBody MergeRequest req) {
        return carts.merge(user.id(), req.items());
    }

    @PatchMapping("/items/{itemId}")
    public CartDto updateQuantity(@AuthenticationPrincipal AuthUser user, @PathVariable Long itemId,
            @Valid @RequestBody UpdateQuantityRequest req) {
        return carts.updateQuantity(user.id(), itemId, req.quantity());
    }

    @DeleteMapping("/items/{itemId}")
    public CartDto remove(@AuthenticationPrincipal AuthUser user, @PathVariable Long itemId) {
        return carts.remove(user.id(), itemId);
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clear(@AuthenticationPrincipal AuthUser user) {
        carts.clear(user.id());
    }
}
