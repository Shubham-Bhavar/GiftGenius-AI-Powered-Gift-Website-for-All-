import { request } from './api/client.js';

/** A signed-in shopper's wishlist on the server (guests keep theirs in this browser; see WishlistContext). */
export const wishlistApi = {
  wishlist: () => request('/wishlist'),
  addToWishlist: (productId) => request(`/wishlist/${productId}`, { method: 'PUT' }),
  removeFromWishlist: (productId) => request(`/wishlist/${productId}`, { method: 'DELETE' }),
  mergeWishlist: (productIds) => request('/wishlist/merge', { method: 'POST', body: { productIds } }),
};

export const wishlistKeys = {
  wishlist: () => ['wishlist'],
};

export const wishlistQueries = {
  wishlist: () => ({ queryKey: wishlistKeys.wishlist(), queryFn: wishlistApi.wishlist }),
};
