package com.giftgenius.payment;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Rupees to paise, the unit payment providers work in. */
final class Paise {

    private Paise() {
    }

    /** ₹1,298.00 → 129800. */
    static long of(BigDecimal rupees) {
        return rupees.setScale(2, RoundingMode.HALF_UP).movePointRight(2).longValueExact();
    }
}
