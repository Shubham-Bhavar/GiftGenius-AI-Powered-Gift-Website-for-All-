package com.giftgenius.cart;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.giftgenius.cart.CartDtos.AddItemRequest;
import com.giftgenius.cart.CartDtos.CartDto;
import com.giftgenius.cart.CartDtos.CartItemDto;
import com.giftgenius.catalog.Product;
import com.giftgenius.catalog.ProductRepository;
import com.giftgenius.common.ApiException;
import com.giftgenius.user.UserRepository;

@Service
public class CartService {

    static final int MAX_QTY_PER_LINE = 10;

    private final CartRepository carts;
    private final ProductRepository products;

    private final UserRepository users;

    public CartService(CartRepository carts, ProductRepository products, UserRepository users) {
        this.carts = carts;
        this.products = products;
        this.users = users;
    }

    /** Read-only: a shopper who never added anything simply has an empty cart (no row is created). */
    @Transactional(readOnly = true)
    public CartDto get(Long userId) {
        return carts.findByUserId(userId).map(CartService::toDto).orElseGet(() -> new CartDto(List.of(), 0, BigDecimal.ZERO));
    }

    @Transactional
    public CartDto add(Long userId, AddItemRequest req) {
        Cart cart = cartFor(userId);
        addLine(cart, req);
        cart.touch();
        carts.flush(); // assign ids to new lines before they go to the client
        return toDto(cart);
    }

    @Transactional
    public CartDto merge(Long userId, List<AddItemRequest> items) {
        Cart cart = cartFor(userId);
        if (items != null) {
            for (AddItemRequest item : items) {
                try {
                    addLine(cart, item);
                } catch (ApiException ignored) {
                    // A guest item that sold out or was removed shouldn't block sign-in.
                }
            }
        }
        cart.touch();
        carts.flush();
        return toDto(cart);
    }

    @Transactional
    public CartDto updateQuantity(Long userId, Long itemId, int quantity) {
        Cart cart = cartFor(userId);
        CartItem item = findItem(cart, itemId);
        if (quantity > item.getProduct().getStock()) {
            throw ApiException.conflict("Only " + item.getProduct().getStock() + " left of "
                    + item.getProduct().getName() + ".");
        }
        item.setQuantity(quantity);
        cart.touch();
        return toDto(cart);
    }

    @Transactional
    public CartDto remove(Long userId, Long itemId) {
        Cart cart = cartFor(userId);
        cart.getItems().remove(findItem(cart, itemId));
        cart.touch();
        return toDto(cart);
    }

    @Transactional
    public void clear(Long userId) {
        users.lockById(userId);
        carts.findByUserId(userId).ifPresent(c -> {
            c.getItems().clear();
            c.touch();
        });
    }

    /** After an online payment succeeds, drop the paid-for products but keep anything added since. */
    @Transactional
    public void removeProducts(Long userId, java.util.Collection<Long> productIds) {
        users.lockById(userId);
        carts.findByUserId(userId).ifPresent(c -> {
            c.getItems().removeIf(i -> productIds.contains(i.getProduct().getId()));
            c.touch();
        });
    }

    /**
     * Returns the shopper's cart for writing, creating it if needed. Every cart write starts by locking
     * the user's row, so parallel requests for one shopper (say, "add to cart" in two tabs, or loading
     * and merging the guest cart right after sign-in) queue up, and each one reads the cart exactly as
     * the previous one left it. InnoDB takes the read snapshot after the lock is granted.
     */
    @Transactional
    public Cart cartFor(Long userId) {
        users.lockById(userId).orElseThrow(() -> ApiException.unauthorized("Please sign in again."));
        return carts.findByUserId(userId)
                .orElseGet(() -> carts.saveAndFlush(new Cart(users.getReferenceById(userId))));
    }

    private void addLine(Cart cart, AddItemRequest req) {
        Product product = products.findByIdAndActiveTrue(req.productId())
                .orElseThrow(() -> ApiException.notFound("That gift is no longer available."));
        String name = clean(req.customName());
        String message = clean(req.customMessage());

        CartItem line = cart.getItems().stream()
                .filter(i -> i.sameLineAs(product.getId(), name, message))
                .findFirst()
                .orElse(null);
        int newQty = Math.min((line == null ? 0 : line.getQuantity()) + req.quantity(), MAX_QTY_PER_LINE);
        if (newQty > product.getStock()) {
            throw ApiException.conflict(product.getStock() == 0
                    ? product.getName() + " is out of stock."
                    : "Only " + product.getStock() + " left of " + product.getName() + ".");
        }
        if (line == null) {
            line = new CartItem();
            line.setCart(cart);
            line.setProduct(product);
            line.setCustomName(name);
            line.setCustomMessage(message);
            cart.getItems().add(line);
        }
        line.setQuantity(newQty);
    }

    private static CartItem findItem(Cart cart, Long itemId) {
        return cart.getItems().stream().filter(i -> i.getId().equals(itemId)).findFirst()
                .orElseThrow(() -> ApiException.notFound("That item isn't in your cart."));
    }

    private static String clean(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }

    static CartDto toDto(Cart cart) {
        List<CartItemDto> items = cart.getItems().stream().map(i -> {
            Product p = i.getProduct();
            BigDecimal line = p.getPrice().multiply(BigDecimal.valueOf(i.getQuantity()));
            return new CartItemDto(i.getId(), p.getId(), p.getName(), p.getImageUrl(), p.getPrice(),
                    i.getQuantity(), line, i.getCustomName(), i.getCustomMessage(), p.getStock(),
                    p.isActive() && p.getStock() >= i.getQuantity());
        }).toList();
        int count = items.stream().mapToInt(CartItemDto::quantity).sum();
        BigDecimal subtotal = items.stream().map(CartItemDto::lineTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new CartDto(items, count, subtotal);
    }
}
