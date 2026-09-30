package com.giftgenius.catalog;

import org.springframework.http.HttpStatus;
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
import com.giftgenius.catalog.ProductDtos.ProductUpsertRequest;
import com.giftgenius.common.PageResponse;
import com.giftgenius.seller.SellerDtos.ReasonRequest;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/admin/products")
public class AdminProductController {

    private final ProductService service;
    private final SellerProductService marketplace;

    public AdminProductController(ProductService service, SellerProductService marketplace) {
        this.service = service;
        this.marketplace = marketplace;
    }

    /** status: one review state, e.g. PENDING_APPROVAL; owner: "platform", "marketplace" or blank for all. */
    @GetMapping
    public PageResponse<ProductDto> list(@RequestParam(required = false) String q,
            @RequestParam(required = false) ProductStatus status, @RequestParam(required = false) String owner,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        return service.adminList(q, status, owner, page, size);
    }

    @GetMapping("/{id}")
    public ProductDto get(@PathVariable Long id) {
        return service.adminGet(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProductDto create(@Valid @RequestBody ProductUpsertRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public ProductDto update(@PathVariable Long id, @Valid @RequestBody ProductUpsertRequest req) {
        return service.update(id, req);
    }

    /** Lists a seller's product that is waiting for approval. */
    @PatchMapping("/{id}/approve")
    public ProductDto approve(@PathVariable Long id) {
        return marketplace.approve(id);
    }

    /** Rejects a seller's product (or takes a listed one down) with a reason the seller sees. */
    @PatchMapping("/{id}/reject")
    public ProductDto reject(@PathVariable Long id, @Valid @RequestBody ReasonRequest req) {
        return marketplace.reject(id, req.reason());
    }

    /** Soft delete: past orders keep referencing the product. A seller's product is archived. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivate(@PathVariable Long id) {
        service.deactivate(id);
    }
}
