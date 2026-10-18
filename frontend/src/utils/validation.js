// Input rules shared by forms, matching the API's own checks.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Shopper phone numbers (same rule as the API). */
export const PHONE_RE = /^[+0-9 ()-]{7,20}$/;
/** Store phone numbers: at least 10 digits' worth. */
export const SELLER_PHONE_RE = /^[+0-9 ()-]{10,20}$/;
/** Indian PIN code: 6 digits, not starting with 0. */
export const PINCODE_RE = /^[1-9][0-9]{5}$/;
/** Text the API refuses (it would look like HTML). */
export const MARKUP_RE = /[<>]/;
/** An https:// link (images for products and stores). */
export const HTTPS_URL_RE = /^https:\/\/[^\s<>"'`]{4,990}$/;
