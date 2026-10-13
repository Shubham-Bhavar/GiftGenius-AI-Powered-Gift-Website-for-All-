import { qs, request } from './api/client.js';

/** Checkout (options and server-side pricing) and a customer's orders. Payment is in services/payment.js. */
export const ordersApi = {
  checkoutOptions: () => request('/checkout/options'),
  quote: (body) => request('/checkout/quote', { method: 'POST', body }),
  placeOrder: (body, idempotencyKey) =>
    request('/orders', { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }),
  orders: (page = 0, size = 10) => request(`/orders${qs({ page, size })}`),
  order: (number) => request(`/orders/${encodeURIComponent(number)}`),
  cancelOrder: (number) => request(`/orders/${encodeURIComponent(number)}/cancel`, { method: 'POST' }),
  track: (orderNumber, email) => request(`/orders/track${qs({ orderNumber, email })}`, { auth: false }),
};

/** Cache keys. ordersKeys.all() covers the list and every order. */
export const ordersKeys = {
  all: () => ['orders'],
  list: (...args) => ['orders', 'list', ...args],
  detail: (number) => ['orders', number],
  checkoutOptions: () => ['checkout-options'],
  quote: (body) => ['quote', body],
};

export const ordersQueries = {
  list: (page) => ({ queryKey: ordersKeys.list(page), queryFn: () => ordersApi.orders(page, 10) }),
  detail: (number) => ({ queryKey: ordersKeys.detail(number), queryFn: () => ordersApi.order(number) }),
  checkoutOptions: () => ({ queryKey: ordersKeys.checkoutOptions(), queryFn: ordersApi.checkoutOptions, staleTime: 5 * 60_000 }),
  /** Server-side pricing of the cart lines, coupon and delivery speed. */
  quote: (body) => ({ queryKey: ordersKeys.quote(body), queryFn: () => ordersApi.quote(body) }),
};
