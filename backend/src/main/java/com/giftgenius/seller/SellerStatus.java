package com.giftgenius.seller;

/** Where a store is in admin review. Only APPROVED stores can submit products or have them listed. */
public enum SellerStatus {
    PENDING,
    APPROVED,
    REJECTED,
    SUSPENDED
}
