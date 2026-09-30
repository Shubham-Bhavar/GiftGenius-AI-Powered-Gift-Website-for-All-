package com.giftgenius.seller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.seller.SellerDtos.PublicStoreDto;

/** Public storefronts. A store's products come from GET /api/products?store={slug}. */
@RestController
@RequestMapping("/api/stores")
public class StoreController {

    private final SellerService sellers;

    public StoreController(SellerService sellers) {
        this.sellers = sellers;
    }

    @GetMapping("/{slug}")
    public PublicStoreDto get(@PathVariable String slug) {
        return sellers.publicStore(slug);
    }
}
