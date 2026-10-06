package com.giftgenius.pricing.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.pricing.dto.CouponDtos.CouponDto;
import com.giftgenius.pricing.dto.CouponDtos.CouponRequest;
import com.giftgenius.pricing.service.CouponService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/admin/coupons")
public class AdminCouponController {

    private final CouponService coupons;

    public AdminCouponController(CouponService coupons) {
        this.coupons = coupons;
    }

    @GetMapping
    public List<CouponDto> list() {
        return coupons.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CouponDto create(@Valid @RequestBody CouponRequest req) {
        return coupons.create(req);
    }

    @PutMapping("/{id}")
    public CouponDto update(@PathVariable Long id, @Valid @RequestBody CouponRequest req) {
        return coupons.update(id, req);
    }
}
