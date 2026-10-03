import { qs, request } from './api/client.js';

/** Store Admin (ADMIN accounts): orders, products, sellers, coupons and customer messages. */
export const adminApi = {
  stats: () => request('/admin/stats'),
  orders: (params) => request(`/admin/orders${qs(params)}`),
  order: (number) => request(`/admin/orders/${encodeURIComponent(number)}`),
  updateStatus: (number, status, note) =>
    request(`/admin/orders/${encodeURIComponent(number)}/status`, { method: 'PATCH', body: { status, note } }),
  products: (params) => request(`/admin/products${qs(params)}`),
  product: (id) => request(`/admin/products/${id}`),
  createProduct: (body) => request('/admin/products', { method: 'POST', body }),
  updateProduct: (id, body) => request(`/admin/products/${id}`, { method: 'PUT', body }),
  deactivateProduct: (id) => request(`/admin/products/${id}`, { method: 'DELETE' }),
  coupons: () => request('/admin/coupons'),
  createCoupon: (body) => request('/admin/coupons', { method: 'POST', body }),
  updateCoupon: (id, body) => request(`/admin/coupons/${id}`, { method: 'PUT', body }),
  messages: (params) => request(`/admin/messages${qs(params)}`),
  markMessageHandled: (id, handled) => request(`/admin/messages/${id}`, { method: 'PATCH', body: { handled } }),
  approveProduct: (id) => request(`/admin/products/${id}/approve`, { method: 'PATCH' }),
  rejectProduct: (id, reason) => request(`/admin/products/${id}/reject`, { method: 'PATCH', body: { reason } }),
  sellers: (params) => request(`/admin/sellers${qs(params)}`),
  seller: (id) => request(`/admin/sellers/${id}`),
  approveSeller: (id) => request(`/admin/sellers/${id}/approve`, { method: 'PATCH' }),
  rejectSeller: (id, reason) => request(`/admin/sellers/${id}/reject`, { method: 'PATCH', body: { reason } }),
  suspendSeller: (id, reason) => request(`/admin/sellers/${id}/suspend`, { method: 'PATCH', body: { reason } }),
  reactivateSeller: (id) => request(`/admin/sellers/${id}/reactivate`, { method: 'PATCH' }),
};

/** Cache keys. adminKeys.all() covers everything in Store Admin. */
export const adminKeys = {
  all: () => ['admin'],
  stats: () => ['admin', 'stats'],
  orders: (...args) => ['admin', 'orders', ...args],
  order: (number) => ['admin', 'order', number],
  products: (...args) => ['admin', 'products', ...args],
  product: (id) => ['admin', 'product', id],
  sellers: (...args) => ['admin', 'sellers', ...args],
  seller: (id) => ['admin', 'seller', id],
  coupons: () => ['admin', 'coupons'],
  messages: (...args) => ['admin', 'messages', ...args],
};

export const adminQueries = {
  stats: () => ({ queryKey: adminKeys.stats(), queryFn: adminApi.stats }),
  orders: ({ status, page }) => ({
    queryKey: adminKeys.orders(status, page),
    queryFn: () => adminApi.orders({ status: status || undefined, page, size: 25 }),
  }),
  order: (number) => ({ queryKey: adminKeys.order(number), queryFn: () => adminApi.order(number) }),
  products: ({ q, status, owner, page }) => ({
    queryKey: adminKeys.products(q, status, owner, page),
    queryFn: () => adminApi.products({ q: q || undefined, status: status || undefined, owner: owner || undefined, page, size: 25 }),
  }),
  product: (id) => ({ queryKey: adminKeys.product(id), queryFn: () => adminApi.product(id) }),
  sellers: ({ status, q, page }) => ({
    queryKey: adminKeys.sellers(status, q, page),
    queryFn: () => adminApi.sellers({ status: status || undefined, q: q || undefined, page, size: 25 }),
  }),
  seller: (id) => ({ queryKey: adminKeys.seller(id), queryFn: () => adminApi.seller(id) }),
  coupons: () => ({ queryKey: adminKeys.coupons(), queryFn: adminApi.coupons }),
  messages: ({ showHandled, page }) => ({
    queryKey: adminKeys.messages(showHandled, page),
    queryFn: () => adminApi.messages({ handled: showHandled ? undefined : false, page, size: 20 }),
  }),
};
