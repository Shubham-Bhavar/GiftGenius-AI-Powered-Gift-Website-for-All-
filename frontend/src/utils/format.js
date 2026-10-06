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

/** ₹1,199: a price as shoppers see it on product pages and cards (en-IN grouping, no currency rounding). */
export const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
});

export const date = (iso) => (iso ? dateFmt.format(new Date(iso)) : '');
export const dateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '');

/** "Rose Bouquet × 2" for one product, "Rose Bouquet + 2 more" for several. */
export function orderItemsLabel(o) {
  const lines = o.lineCount ?? 1;
  if (lines > 1) return `${o.firstItemName} + ${lines - 1} more`;
  return o.itemCount > 1 ? `${o.firstItemName} × ${o.itemCount}` : o.firstItemName;
}

export function titleCase(s) {
  return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
}
