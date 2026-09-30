/**
 * Marketplace vocabulary shared by the seller and admin pages. The API is the authority on every rule here
 * (roles, ownership, allowed categories, status changes); these only label and pre-check.
 */

/** The shop's categories, the same list the API accepts for seller products and stores. */
export const SELLER_CATEGORIES = ['accessories', 'cultural', 'flowers', 'food & sweets', 'fragrance', 'gift sets',
  'home decor', 'personalized', 'wellness'];

export const SELLER_OCCASIONS = ['birthday', 'anniversary', 'festival', 'graduation', 'valentine', 'baby', 'achievement'];

export const SELLER_STATUS = {
  PENDING: { label: 'Pending review', tone: 'warn' },
  APPROVED: { label: 'Approved', tone: 'ok' },
  REJECTED: { label: 'Not approved', tone: 'bad' },
  SUSPENDED: { label: 'Suspended', tone: 'bad' },
};

export const PRODUCT_STATUS = {
  DRAFT: { label: 'Draft', tone: 'info' },
  PENDING_APPROVAL: { label: 'Awaiting approval', tone: 'warn' },
  APPROVED: { label: 'Approved', tone: 'ok' },
  REJECTED: { label: 'Rejected', tone: 'bad' },
  ARCHIVED: { label: 'Archived', tone: 'info' },
  OUT_OF_STOCK: { label: 'Out of stock', tone: 'bad' },
};

export const FULFILMENT_STATUS = {
  NEW: { label: 'To pack', tone: 'warn', action: 'Mark as new' },
  PACKED: { label: 'Packed', tone: 'info', action: 'Mark as packed' },
  SHIPPED: { label: 'Shipped', tone: 'info', action: 'Mark as shipped' },
  DELIVERED: { label: 'Delivered', tone: 'ok', action: 'Mark as delivered' },
  CANCELLED: { label: 'Cancelled', tone: 'bad', action: null },
};

/** What a seller's product list shows: an approved product with no stock reads "Out of stock". */
export const productState = (p) => (p.status === 'APPROVED' && p.stock === 0 ? 'OUT_OF_STOCK' : p.status);

/** Where someone lands after signing in when nothing else was asked for. */
export function homeFor(user) {
  if (user?.role === 'ADMIN') return '/admin';
  if (user?.role === 'SELLER') return '/seller';
  return null;
}

/** Labels for a status map entry, falling back to the raw value. */
export const labelOf = (map, key) => map[key]?.label ?? key;
