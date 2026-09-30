package com.giftgenius.user;

public enum Role {
    CUSTOMER,
    /** A customer who also sells; what they may sell depends on their store's {@code SellerStatus}. */
    SELLER,
    ADMIN
}
