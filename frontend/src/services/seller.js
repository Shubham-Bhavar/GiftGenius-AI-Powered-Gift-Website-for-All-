import { qs, request } from './api/client.js';

/** Seller Center (SELLER accounts). The API scopes every call to the signed-in seller. */
export const sellerApi = {
  me: () => request('/seller/me'),
  dashboard: () => request('/seller/dashboard'),
  analytics: () => request('/seller/analytics'),
  updateStore: (body) => request('/seller/profile', { method: 'PUT', body }),
  reapply: () => request('/seller/profile/reapply', { method: 'POST' }),
  products: (params) => request(`/seller/products${qs(params)}`),
  product: (id) => request(`/seller/products/${encodeURIComponent(id)}`),
  createProduct: (body) => request('/seller/products', { method: 'POST', body }),
  updateProduct: (id, body) => request(`/seller/products/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  submitProduct: (id) => request(`/seller/products/${encodeURIComponent(id)}/submit`, { method: 'POST' }),
  archiveProduct: (id) => request(`/seller/products/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  orders: (params) => request(`/seller/orders${qs(params)}`),
  order: (number) => request(`/seller/orders/${encodeURIComponent(number)}`),
  updateOrder: (number, status, note) =>
    request(`/seller/orders/${encodeURIComponent(number)}/status`, { method: 'PATCH', body: { status, note } }),
};

/** Cache keys. sellerKeys.all() covers everything in the Seller Center. */
export const sellerKeys = {
  all: () => ['seller'],
  store: () => ['seller', 'me'],
  dashboard: () => ['seller', 'dashboard'],
  analytics: () => ['seller', 'analytics'],
  products: (...args) => ['seller', 'products', ...args],
  product: (id) => ['seller', 'product', id],
  orders: (...args) => ['seller', 'orders', ...args],
  order: (number) => ['seller', 'order', number],
};

export const sellerQueries = {
  /** The signed-in seller's store (its status decides what they may do). */
  store: () => ({ queryKey: sellerKeys.store(), queryFn: sellerApi.me }),
  dashboard: () => ({ queryKey: sellerKeys.dashboard(), queryFn: sellerApi.dashboard }),
  analytics: () => ({ queryKey: sellerKeys.analytics(), queryFn: sellerApi.analytics }),
  products: ({ q, status, category, sort, page }) => ({
    queryKey: sellerKeys.products(q, status, category, sort, page),
    queryFn: () => sellerApi.products({ q: q || undefined, status: status || undefined, category: category || undefined, sort, page, size: 20 }),
  }),
  product: (id) => ({ queryKey: sellerKeys.product(id), queryFn: () => sellerApi.product(id) }),
  orders: ({ status, page }) => ({
    queryKey: sellerKeys.orders(status, page),
    queryFn: () => sellerApi.orders({ status: status || undefined, page, size: 20 }),
  }),
  order: (number) => ({ queryKey: sellerKeys.order(number), queryFn: () => sellerApi.order(number) }),
};
