package com.giftgenius.pricing;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.giftgenius.common.ApiException;
import com.giftgenius.pricing.CouponDtos.CouponDto;
import com.giftgenius.pricing.CouponDtos.CouponRequest;

/** Store Admin's coupon management. Applying coupons at checkout is PricingService's job. */
@Service
public class CouponService {

    private final CouponRepository coupons;

    public CouponService(CouponRepository coupons) {
        this.coupons = coupons;
    }

    @Transactional(readOnly = true)
    public List<CouponDto> list() {
        return coupons.findAll(Sort.by("code")).stream().map(CouponDto::from).toList();
    }

    @Transactional
    public CouponDto create(CouponRequest req) {
        String code = req.code().trim().toUpperCase();
        if (coupons.findByCodeIgnoreCase(code).isPresent()) {
            throw ApiException.conflict("A coupon with that code already exists.");
        }
        Coupon c = new Coupon();
        c.setCode(code);
        apply(c, req);
        return CouponDto.from(coupons.save(c));
    }

    /** A coupon's code is fixed once created; everything else can change. */
    @Transactional
    public CouponDto update(Long id, CouponRequest req) {
        Coupon c = coupons.findById(id).orElseThrow(() -> ApiException.notFound("Coupon not found."));
        if (!c.getCode().equalsIgnoreCase(req.code().trim())) {
            throw ApiException.badRequest("A coupon's code can't be changed. Create a new coupon instead.");
        }
        apply(c, req);
        return CouponDto.from(c);
    }

    private static void apply(Coupon c, CouponRequest r) {
        if (r.type() == CouponType.PERCENT && r.discountValue().compareTo(BigDecimal.valueOf(100)) > 0) {
            throw ApiException.badRequest("A percentage discount can't exceed 100.");
        }
        if (r.validFrom() != null && r.validUntil() != null && !r.validUntil().isAfter(r.validFrom())) {
            throw ApiException.badRequest("The end date must be after the start date.");
        }
        c.setType(r.type());
        c.setDiscountValue(r.discountValue());
        c.setMinOrderAmount(r.minOrderAmount() == null ? BigDecimal.ZERO : r.minOrderAmount());
        c.setMaxDiscount(r.maxDiscount());
        c.setUsageLimit(r.usageLimit());
        c.setPerUserLimit(r.perUserLimit());
        c.setValidFrom(r.validFrom());
        c.setValidUntil(r.validUntil());
        c.setActive(r.active() == null || r.active());
    }
}
