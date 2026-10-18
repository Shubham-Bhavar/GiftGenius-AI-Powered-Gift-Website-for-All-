import { qs, request } from './api/client.js';

/** The public catalogue: products, categories and seller storefronts. */
export const catalogApi = {
  products: (params, signal) => request(`/products${qs(params)}`, { signal }),
  product: (id) => request(`/products/${encodeURIComponent(id)}`),
  related: (id, limit = 4) => request(`/products/${encodeURIComponent(id)}/related${qs({ limit })}`),
  categories: () => request('/products/categories'),
  store: (slug) => request(`/stores/${encodeURIComponent(slug)}`),
};

/** Cache keys. Called with no arguments, a key covers every query of that kind (handy for invalidation). */
export const catalogKeys = {
  catalog: () => ['catalog'],
  categories: () => ['categories'],
  products: (...args) => ['products', ...args],
  product: (...args) => ['product', ...args],
  related: (...args) => ['related', ...args],
  store: (...args) => ['store', ...args],
};

/** The catalogue queries screens use. Screen-only options (placeholderData, enabled) stay with the screen. */
export const catalogQueries = {
  /** The first 100 products: the homepage sections and the header's search suggestions share it. */
  catalog: () => ({ queryKey: catalogKeys.catalog(), queryFn: () => catalogApi.products({ size: 100 }), staleTime: 60_000 }),
  categories: () => ({ queryKey: catalogKeys.categories(), queryFn: catalogApi.categories, staleTime: 10 * 60_000 }),
  /** The shop grid for a search/filter/sort/page query. */
  products: (query) => ({ queryKey: catalogKeys.products(query), queryFn: ({ signal }) => catalogApi.products(query, signal) }),
  product: (id) => ({ queryKey: catalogKeys.product(id), queryFn: () => catalogApi.product(id) }),
  related: (id) => ({ queryKey: catalogKeys.related(id), queryFn: () => catalogApi.related(id, 4) }),
  store: (slug) => ({ queryKey: catalogKeys.store(slug), queryFn: () => catalogApi.store(slug) }),
  /** One storefront's products, newest first. */
  storeProducts: (slug, category, page) => ({
    queryKey: catalogKeys.products('store', slug, category, page),
    queryFn: () => catalogApi.products({ store: slug, category: category || undefined, sort: 'newest', page, size: 24 }),
  }),
};
