package com.giftgenius.pricing;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CouponRepository extends JpaRepository<Coupon, Long> {

    Optional<Coupon> findByCodeIgnoreCase(String code);

    /** Atomically consumes one use; returns 0 if the coupon ran out in the meantime. */
    @Modifying(flushAutomatically = true)
    @Query("update Coupon c set c.usedCount = c.usedCount + 1 where upper(c.code) = upper(:code) "
            + "and c.active = true and (c.usageLimit is null or c.usedCount < c.usageLimit)")
    int consume(@Param("code") String code);

    @Modifying(flushAutomatically = true)
    @Query("update Coupon c set c.usedCount = c.usedCount - 1 where upper(c.code) = upper(:code) and c.usedCount > 0")
    int release(@Param("code") String code);
}
