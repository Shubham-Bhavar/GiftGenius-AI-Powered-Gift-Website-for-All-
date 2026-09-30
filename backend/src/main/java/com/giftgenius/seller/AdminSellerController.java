package com.giftgenius.seller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.common.PageResponse;
import com.giftgenius.seller.SellerDtos.AdminSellerDetail;
import com.giftgenius.seller.SellerDtos.AdminSellerSummary;
import com.giftgenius.seller.SellerDtos.ReasonRequest;

import jakarta.validation.Valid;

/** Seller review and management. Under /api/admin, so ADMIN only (SecurityConfig). */
@RestController
@RequestMapping("/api/admin/sellers")
public class AdminSellerController {

    private final SellerService sellers;

    public AdminSellerController(SellerService sellers) {
        this.sellers = sellers;
    }

    @GetMapping
    public PageResponse<AdminSellerSummary> list(@RequestParam(required = false) SellerStatus status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return sellers.adminList(status, q, page, size);
    }

    @GetMapping("/{id}")
    public AdminSellerDetail get(@PathVariable Long id) {
        return sellers.adminGet(id);
    }

    @PatchMapping("/{id}/approve")
    public AdminSellerDetail approve(@PathVariable Long id) {
        return sellers.approve(id);
    }

    @PatchMapping("/{id}/reject")
    public AdminSellerDetail reject(@PathVariable Long id, @Valid @RequestBody ReasonRequest req) {
        return sellers.reject(id, req.reason());
    }

    @PatchMapping("/{id}/suspend")
    public AdminSellerDetail suspend(@PathVariable Long id, @Valid @RequestBody ReasonRequest req) {
        return sellers.suspend(id, req.reason());
    }

    @PatchMapping("/{id}/reactivate")
    public AdminSellerDetail reactivate(@PathVariable Long id) {
        return sellers.reactivate(id);
    }
}
