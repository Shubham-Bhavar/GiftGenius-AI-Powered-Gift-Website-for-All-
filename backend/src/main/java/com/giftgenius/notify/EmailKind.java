package com.giftgenius.notify;

/** What a queued email is about (stored in email_outbox.kind). */
public enum EmailKind {
    /** To the customer: the order is confirmed (placed, or paid online). */
    ORDER_CONFIRMED,
    /** To a seller: a confirmed order has lines for them to fulfil. */
    ORDER_NEW_FOR_SELLER,
    /** To the customer: the order moved to a new status (shipped, delivered, cancelled...). */
    ORDER_STATUS,
    /** To the customer: one seller shipped or delivered their part of the order. */
    ORDER_PART_SHIPPED
}
