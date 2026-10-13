import { request } from './api/client.js';

/** A signed-in shopper's cart on the server (guests keep theirs in this browser; see CartContext). */
export const cartApi = {
  cart: () => request('/cart'),
  addToCart: (body) => request('/cart/items', { method: 'POST', body }),
  updateCartItem: (id, quantity) => request(`/cart/items/${id}`, { method: 'PATCH', body: { quantity } }),
  removeCartItem: (id) => request(`/cart/items/${id}`, { method: 'DELETE' }),
  clearCart: () => request('/cart', { method: 'DELETE' }),
  mergeCart: (items) => request('/cart/merge', { method: 'POST', body: { items } }),
};

export const cartKeys = {
  cart: () => ['cart'],
};

export const cartQueries = {
  cart: () => ({ queryKey: cartKeys.cart(), queryFn: cartApi.cart }),
};
