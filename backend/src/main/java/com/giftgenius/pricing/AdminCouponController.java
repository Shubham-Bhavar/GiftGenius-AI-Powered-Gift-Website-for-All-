package com.giftgenius.pricing;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.common.ApiException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

@RestController
@RequestMapping("/api/admin/coupons")
public class AdminCouponController {

    public record CouponDto(Long id, String code, CouponType type, BigDecimal discountValue, BigDecimal minOrderAmount,
            BigDecimal maxDiscount, Integer usageLimit, int usedCount, Integer perUserLimit, Instant validFrom,
            Instant validUntil, boolean active) {

        static CouponDto from(Coupon c) {
            return new CouponDto(c.getId(), c.getCode(), c.getType(), c.getDiscountValue(), c.getMinOrderAmount(),
                    c.getMaxDiscount(), c.getUsageLimit(), c.getUsedCount(), c.getPerUserLimit(), c.getValidFrom(),
                    c.getValidUntil(), c.isActive());
        }
    }

    public record CouponRequest(
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9_-]{3,40}$", message = "Use 3–40 letters, digits, - or _") String code,
            @NotNull CouponType type,
            @NotNull @DecimalMin(value = "0.01") BigDecimal discountValue,
            @DecimalMin("0") BigDecimal minOrderAmount,
            @DecimalMin("0") BigDecimal maxDiscount,
            @Min(1) Integer usageLimit,
            @Min(1) Integer perUserLimit,
            Instant validFrom,
            Instant validUntil,
            Boolean active) {
    }

    private final CouponRepository coupons;

    public AdminCouponController(CouponRepository coupons) {
        this.coupons = coupons;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<CouponDto> list() {
        return coupons.findAll(Sort.by("code")).stream().map(CouponDto::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public CouponDto create(@Valid @RequestBody CouponRequest req) {
        String code = req.code().trim().toUpperCase();
        if (coupons.findByCodeIgnoreCase(code).isPresent()) {
            throw ApiException.conflict("A coupon with that code already exists.");
        }
        Coupon c = new Coupon();
        c.setCode(code);
        apply(c, req);
        return CouponDto.from(coupons.save(c));
    }

    @PutMapping("/{id}")
    @Transactional
    public CouponDto update(@PathVariable Long id, @Valid @RequestBody CouponRequest req) {
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
