import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard.jsx';
import { EmptyState, ErrorNote, PageHero, Pagination } from '../components/ui.jsx';
import { useUi } from '../context/UiContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useReveal } from '../hooks/useReveal.js';
import { api } from '../lib/api.js';
import { titleCase } from '../lib/format.js';

const OCCASIONS = [
  ['', 'All occasions'], ['birthday', 'Birthday'], ['anniversary', 'Anniversary'], ['festival', 'Festival'],
  ['valentine', "Valentine's"], ['graduation', 'Graduation'], ['baby', 'Baby'], ['achievement', 'Achievement'],
];
const PRICE_BANDS = [
  ['', '', 'Any price'], ['', '500', 'Under ₹500'], ['', '999', 'Under ₹999'], ['1000', '2000', '₹1,000 – ₹2,000'], ['2000', '', '₹2,000+'],
];
const PAGE_SIZE = 12;

export default function Shop() {
  const [params, setParams] = useSearchParams();
  // The latest query string, kept in a ref so the debounced search (which fires later) builds on it and can't
  // undo a filter the shopper clicked in the meantime. It is set the moment a filter changes (navigation
  // renders asynchronously) and re-synced from the router for back/forward and links.
  const { search: liveSearch } = useLocation();
  const live = useRef(liveSearch);
  useLayoutEffect(() => { live.current = liveSearch; }, [liveSearch]);
  const replaceParams = (next) => {
    const nextParams = new URLSearchParams(next);
    live.current = `?${nextParams}`;
    setParams(nextParams);
  };
  const { openGiftFinder } = useUi();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const occasion = params.get('occasion') ?? '';
  const tag = params.get('tag') ?? '';
  const minPrice = params.get('minPrice') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const sort = params.get('sort') ?? 'featured';
  const page = Math.max(0, Number(params.get('page') ?? 0) || 0);

  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);

  const occasionLabel = OCCASIONS.find(([k]) => k === occasion)?.[1];
  const rupee = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
  const [heroTitle, heroEm] = q ? ['Results for', `“${q}”`]
    : category ? [titleCase(category), null]
      : occasion ? [occasionLabel, 'Gifts']
        : tag ? [titleCase(tag.replace('-', ' ')), 'Gifts']
          : maxPrice && !minPrice ? ['Gifts Under', rupee(maxPrice)]
            : minPrice && maxPrice ? [`${rupee(minPrice)} – ${rupee(maxPrice)}`, 'Gifts']
              : minPrice ? [`${rupee(minPrice)}+`, 'Gifts']
                : sort === 'newest' ? ['New', 'Arrivals']
                  : ['All', 'Gifts'];
  useDocumentTitle([heroTitle, heroEm].filter(Boolean).join(' '));

  const query = { q, category, occasion, tag, minPrice, maxPrice, sort, page, size: PAGE_SIZE };
  const products = useQuery({
    queryKey: ['products', query],
    queryFn: ({ signal }) => api.products(query, signal),
    placeholderData: keepPreviousData,
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 10 * 60_000 });
  useReveal([products.data]);

  const update = (changes) => {
    const next = new URLSearchParams(live.current);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in changes)) next.delete('page');
    replaceParams(next);
  };

  useEffect(() => {
    if (search === q) return undefined;
    const t = setTimeout(() => update({ q: search.trim() }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const band = PRICE_BANDS.findIndex(([min, max]) => min === minPrice && max === maxPrice);
  const data = products.data;
  const hasFilters = q || category || occasion || tag || minPrice || maxPrice;

  return (
    <>
      <PageHero eyebrow="Our Collection" title={heroTitle} em={heroEm}>
        Thoughtfully curated gifts for every person and every occasion — hand-wrapped and delivered across India.
      </PageHero>

      <section className="products-section shop-section" aria-labelledby="shop-heading">
        <div className="shop-toolbar">
          <div className="search-wrap shop-search">
            <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <label htmlFor="shopSearch" className="sr-only">Search gifts</label>
            <input id="shopSearch" type="search" placeholder="Search chocolates, perfume, hampers…" value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label htmlFor="shopCategory" className="sr-only">Category</label>
          <select id="shopCategory" className="sort-select" value={category} onChange={(e) => update({ category: e.target.value })}>
            <option value="">All categories</option>
            {categories.data?.map((c) => <option key={c.category} value={c.category}>{titleCase(c.category)} ({c.count})</option>)}
          </select>
          <label htmlFor="shopPrice" className="sr-only">Price</label>
          <select id="shopPrice" className="sort-select" value={band < 0 ? 0 : band} onChange={(e) => {
            const [min, max] = PRICE_BANDS[Number(e.target.value)];
            update({ minPrice: min, maxPrice: max });
          }}>
            {PRICE_BANDS.map(([, , label], i) => <option key={label} value={i}>{label}</option>)}
          </select>
          <label htmlFor="shopSort" className="sr-only">Sort products</label>
          <select id="shopSort" className="sort-select" value={sort} onChange={(e) => update({ sort: e.target.value === 'featured' ? '' : e.target.value })}>
            <option value="featured">Sort: Featured</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="rating">Top Rated</option>
            <option value="newest">Newest</option>
          </select>
        </div>

        <div className="pills" role="group" aria-label="Filter by occasion">
          {OCCASIONS.map(([key, label]) => (
            <button key={key || 'all'} type="button" className={`pill ${occasion === key ? 'active' : ''}`} aria-pressed={occasion === key}
              onClick={() => update({ occasion: key })}>
              {label}
            </button>
          ))}
        </div>

        <div className="sec-topbar">
          <h2 id="shop-heading">{data ? `${data.totalElements} ${data.totalElements === 1 ? 'gift' : 'gifts'}` : 'Gifts'}</h2>
          <div className="shop-topbar-actions">
            {hasFilters && (
              <button type="button" className="link-arrow link-button" onClick={() => { setSearch(''); replaceParams(sort !== 'featured' ? { sort } : {}); }}>
                Clear filters ✕
              </button>
            )}
            <button type="button" className="btn-outline btn-sm" onClick={openGiftFinder}>✨ Not sure? Ask GiftGenius AI</button>
          </div>
        </div>

        <ErrorNote error={products.error} onRetry={() => products.refetch()} />
        {products.isPending && <ProductGridSkeleton count={8} />}
        {data && data.content.length === 0 && (
          <EmptyState icon="🔍" title="No gifts match those filters"
            action={<>
              <button type="button" className="btn-primary" onClick={() => { setSearch(''); replaceParams({}); }}>Show all gifts →</button>
              <button type="button" className="btn-outline" onClick={openGiftFinder}>✨ Ask GiftGenius AI</button>
            </>}>
            Try a different search, widen the price range, or let our AI gift finder suggest something.
          </EmptyState>
        )}
        {data && data.content.length > 0 && (
          <div className={products.isPlaceholderData ? 'is-stale' : ''}>
            <ProductGrid products={data.content} />
            <Pagination page={data.page} totalPages={data.totalPages} onChange={(p) => { update({ page: String(p) }); window.scrollTo({ top: 0 }); }} />
          </div>
        )}
      </section>
    </>
  );
}
