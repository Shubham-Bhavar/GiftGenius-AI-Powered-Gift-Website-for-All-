package com.giftgenius.catalog;

/**
 * Review state of a product. GiftGenius's own products are always APPROVED. A seller's product starts as a
 * DRAFT, is submitted for review (PENDING_APPROVAL), and is listed in the shop only once APPROVED.
 * "Out of stock" isn't a state: it is an approved product with no stock left.
 */
public enum ProductStatus {
    DRAFT,
    PENDING_APPROVAL,
    APPROVED,
    REJECTED,
    ARCHIVED
}
