const inrFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

/** ₹1,299 (whole rupees) or ₹1,299.50 when there are paise. */
export function inr(value) {
  const n = Number(value ?? 0);
  return Number.isInteger(Math.round(n * 100) / 100) ? inrFormatter.format(n) : inrPaise.format(n);
}

export function percentOff(price, original) {
  const p = Number(price);
  const o = Number(original);
  if (!o || o <= p) return 0;
  return Math.round(((o - p) / o) * 100);
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
});

export const date = (iso) => (iso ? dateFmt.format(new Date(iso)) : '');
export const dateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '');

export const ORDER_STATUS = {
  PENDING_PAYMENT: { label: 'Awaiting payment', tone: 'warn' },
  CONFIRMED: { label: 'Confirmed', tone: 'info' },
  PACKED: { label: 'Packed', tone: 'info' },
  SHIPPED: { label: 'Shipped', tone: 'info' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tone: 'info' },
  DELIVERED: { label: 'Delivered', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'bad' },
};

export const PAYMENT_STATUS = {
  PENDING: 'Payment pending',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  REFUND_PENDING: 'Refund in progress',
};

export const DELIVERY_LABEL = { STANDARD: 'Standard', EXPRESS: 'Express', SAME_DAY: 'Same day' };

/** The order lifecycle steps shown in the progress tracker. */
export const ORDER_STEPS = ['CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

export const CANCELLABLE = new Set(['PENDING_PAYMENT', 'CONFIRMED', 'PACKED']);

/** "Rose Bouquet × 2" for one product, "Rose Bouquet + 2 more" for several. */
export function orderItemsLabel(o) {
  const lines = o.lineCount ?? 1;
  if (lines > 1) return `${o.firstItemName} + ${lines - 1} more`;
  return o.itemCount > 1 ? `${o.firstItemName} × ${o.itemCount}` : o.firstItemName;
}

export function titleCase(s) {
  return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A random key per checkout attempt, so a retried "Place order" never creates a second order. */
export function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
