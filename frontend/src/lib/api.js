/**
 * GiftGenius API client.
 *
 * - The access token lives only in memory; the refresh token is an httpOnly cookie scoped to /api/auth.
 * - A 401 on an authenticated call triggers one refresh, then the call is retried once.
 * - Refreshes are serialised within the tab (shared promise) and across tabs (Web Locks API), so two
 *   tabs never present the same rotating refresh token at once.
 */
import { storage } from './storage.js';

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '') + '/api';
const SESSION_HINT = 'gg-session';
const CSRF_HEADER = { 'X-Requested-With': 'GiftGenius' };

export class ApiError extends Error {
  constructor(status, detail, errors) {
    super(detail || 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors || {};
  }
}

let accessToken = null;
let refreshing = null;
const listeners = new Set();

/** Subscribe to session changes: called with the user object, or null on sign-out. */
export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setSession(data) {
  accessToken = data?.accessToken ?? null;
  const user = data?.user ?? null;
  if (user) storage.set(SESSION_HINT, '1');
  else storage.remove(SESSION_HINT);
  listeners.forEach((fn) => fn(user));
  return user;
}

/** Ends the session locally (e.g. another tab signed out) without calling the server. */
export function forgetSession() {
  if (accessToken || storage.get(SESSION_HINT)) setSession(null);
}

export function hasSessionHint() {
  return storage.get(SESSION_HINT) === '1';
}

async function parse(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function rawFetch(path, { method = 'GET', body, headers = {}, auth = true, signal } = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (auth && accessToken) h.Authorization = `Bearer ${accessToken}`;
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError(0, "We couldn't reach GiftGenius. Check your connection and try again.");
  }
  return res;
}

async function doRefresh() {
  const res = await rawFetch('/auth/refresh', { method: 'POST', auth: false, headers: CSRF_HEADER });
  const data = await parse(res);
  if (res.status === 401 || res.status === 403) {
    setSession(null); // the session is really over
    return null;
  }
  if (!res.ok) {
    // 5xx or proxy error (e.g. a deploy in progress): not signed out, just unreachable. Keep the hint so
    // the next page load or 401 tries again.
    throw new ApiError(res.status, data?.detail);
  }
  return setSession(data);
}

/** Exchanges the refresh cookie for a new access token. Resolves to the user, or null if signed out. */
export function refreshSession() {
  if (refreshing) return refreshing;
  const run = () => doRefresh();
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  refreshing = (locks?.request ? locks.request('gg-refresh', run) : run())
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function request(path, opts = {}) {
  let res = await rawFetch(path, opts);
  if (res.status === 401 && opts.auth !== false && accessToken) {
    const user = await refreshSession();
    if (user) res = await rawFetch(path, opts);
  }
  const data = await parse(res);
  if (!res.ok) {
    throw new ApiError(res.status, data?.detail, data?.errors);
  }
  return data;
}

const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  // Auth
  async login(email, password) {
    return setSession(await request('/auth/login', { method: 'POST', body: { email, password }, auth: false }));
  },
  async register(body) {
    return setSession(await request('/auth/register', { method: 'POST', body, auth: false }));
  },
  async logout() {
    try {
      await rawFetch('/auth/logout', { method: 'POST', auth: false, headers: CSRF_HEADER });
    } finally {
      setSession(null);
    }
  },
  me: () => request('/auth/me'),
  updateProfile: (body) => request('/auth/me', { method: 'PATCH', body }),
  async changePassword(currentPassword, newPassword) {
    return setSession(await request('/auth/password/change', { method: 'POST', body: { currentPassword, newPassword } }));
  },
  forgotPassword: (email) => request('/auth/password/forgot', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token, password) =>
    request('/auth/password/reset', { method: 'POST', body: { token, password }, auth: false }),

  // Catalog
  products: (params, signal) => request(`/products${qs(params)}`, { signal }),
  product: (id) => request(`/products/${encodeURIComponent(id)}`),
  related: (id, limit = 4) => request(`/products/${encodeURIComponent(id)}/related${qs({ limit })}`),
  categories: () => request('/products/categories'),

  // Cart & wishlist (signed-in)
  cart: () => request('/cart'),
  addToCart: (body) => request('/cart/items', { method: 'POST', body }),
  updateCartItem: (id, quantity) => request(`/cart/items/${id}`, { method: 'PATCH', body: { quantity } }),
  removeCartItem: (id) => request(`/cart/items/${id}`, { method: 'DELETE' }),
  clearCart: () => request('/cart', { method: 'DELETE' }),
  mergeCart: (items) => request('/cart/merge', { method: 'POST', body: { items } }),
  wishlist: () => request('/wishlist'),
  addToWishlist: (productId) => request(`/wishlist/${productId}`, { method: 'PUT' }),
  removeFromWishlist: (productId) => request(`/wishlist/${productId}`, { method: 'DELETE' }),
  mergeWishlist: (productIds) => request('/wishlist/merge', { method: 'POST', body: { productIds } }),

  // Checkout & orders
  checkoutOptions: () => request('/checkout/options'),
  quote: (body) => request('/checkout/quote', { method: 'POST', body }),
  placeOrder: (body, idempotencyKey) =>
    request('/orders', { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }),
  orders: (page = 0, size = 10) => request(`/orders${qs({ page, size })}`),
  order: (number) => request(`/orders/${encodeURIComponent(number)}`),
  verifyPayment: (number, body) =>
    request(`/orders/${encodeURIComponent(number)}/payment/verify`, { method: 'POST', body }),
  cancelOrder: (number) => request(`/orders/${encodeURIComponent(number)}/cancel`, { method: 'POST' }),
  track: (orderNumber, email) => request(`/orders/track${qs({ orderNumber, email })}`, { auth: false }),

  // AI
  recommend: (body) => request('/ai/recommendations', { method: 'POST', body }),
  giftMessages: (body) => request('/ai/gift-message', { method: 'POST', body }),

  // Location (checkout "Use my current location"): rounded coordinates in the body, address parts back.
  reverseGeocode: (latitude, longitude) =>
    request('/location/reverse', { method: 'POST', body: { latitude, longitude } }),

  // Other
  subscribe: (email) => request('/newsletter/subscribe', { method: 'POST', body: { email }, auth: false }),
  contact: (body) => request('/contact', { method: 'POST', body }),

  // Admin
  admin: {
    stats: () => request('/admin/stats'),
    orders: (params) => request(`/admin/orders${qs(params)}`),
    order: (number) => request(`/admin/orders/${encodeURIComponent(number)}`),
    updateStatus: (number, status, note) =>
      request(`/admin/orders/${encodeURIComponent(number)}/status`, { method: 'PATCH', body: { status, note } }),
    products: (params) => request(`/admin/products${qs(params)}`),
    createProduct: (body) => request('/admin/products', { method: 'POST', body }),
    updateProduct: (id, body) => request(`/admin/products/${id}`, { method: 'PUT', body }),
    deactivateProduct: (id) => request(`/admin/products/${id}`, { method: 'DELETE' }),
    coupons: () => request('/admin/coupons'),
    createCoupon: (body) => request('/admin/coupons', { method: 'POST', body }),
    updateCoupon: (id, body) => request(`/admin/coupons/${id}`, { method: 'PUT', body }),
    messages: (params) => request(`/admin/messages${qs(params)}`),
    markMessageHandled: (id, handled) => request(`/admin/messages/${id}`, { method: 'PATCH', body: { handled } }),
  },
};

/** For tests only. */
export function __resetApiForTests() {
  accessToken = null;
  refreshing = null;
  listeners.clear();
}
