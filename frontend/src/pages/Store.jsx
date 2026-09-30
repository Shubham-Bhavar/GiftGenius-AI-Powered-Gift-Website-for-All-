import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import SafeImg from '../components/SafeImg.jsx';
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard.jsx';
import { EmptyState, ErrorNote, PageHero, Pagination, Spinner } from '../components/ui.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../lib/api.js';
import { date, titleCase } from '../lib/format.js';

/** A seller's public storefront: their story and their approved products. Nothing private is shown. */
export default function Store() {
  const { slug } = useParams();
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const store = useQuery({ queryKey: ['store', slug], queryFn: () => api.store(slug) });
  const products = useQuery({
    queryKey: ['products', 'store', slug, category, page],
    queryFn: () => api.products({ store: slug, category: category || undefined, sort: 'newest', page, size: 24 }),
    enabled: !!store.data,
    placeholderData: keepPreviousData,
  });
  useDocumentTitle(store.data ? store.data.storeName : 'Store');

  if (store.isPending) return <Spinner label="Loading the store…" />;
  if (store.error) {
    return (
      <div className="gg-page">
        {store.error.status === 404 ? (
          <EmptyState level={1} icon="🏪" title="We couldn't find that store" action={<Link to="/shop" className="btn-primary">Browse All Gifts →</Link>}>
            The link may be old, or the store isn&apos;t open right now.
          </EmptyState>
        ) : <ErrorNote error={store.error} onRetry={() => store.refetch()} />}
      </div>
    );
  }
  const s = store.data;
  return (
    <>
      <PageHero eyebrow="GiftGenius Store" title={s.storeName}>
        {titleCase(s.businessCategory)} · on GiftGenius since {date(s.memberSince)}
      </PageHero>
      <div className="gg-page">
        {(s.bannerUrl || s.logoUrl || s.description) && (
          <section className="store-intro" aria-label={`About ${s.storeName}`}>
            {s.bannerUrl && <div className="store-banner"><SafeImg src={s.bannerUrl} alt="" /></div>}
            <div className="store-about">
              {s.logoUrl && <SafeImg className="store-logo" src={s.logoUrl} alt={`${s.storeName} logo`} />}
              {s.description && <p>{s.description}</p>}
            </div>
          </section>
        )}
        <h2 className="store-h">Gifts from {s.storeName}</h2>
        {s.categories.length > 1 && (
          <div className="store-cats" role="group" aria-label="Filter by category">
            <button type="button" className={`sel-chip ${category === '' ? 'is-on' : ''}`} aria-pressed={category === ''}
              onClick={() => { setCategory(''); setPage(0); }}>All ({s.productCount})</button>
            {s.categories.map((c) => (
              <button key={c} type="button" className={`sel-chip ${category === c ? 'is-on' : ''}`} aria-pressed={category === c}
                onClick={() => { setCategory(c); setPage(0); }}>{titleCase(c)}</button>
            ))}
          </div>
        )}
        {products.isPending && <ProductGridSkeleton count={4} />}
        <ErrorNote error={products.error} onRetry={() => products.refetch()} />
        {products.data?.content.length === 0 && (
          <EmptyState icon="🎁" title="No products listed yet">This store is getting its first gifts ready. Check back soon.</EmptyState>
        )}
        {products.data?.content.length > 0 && (
          <div className={products.isPlaceholderData ? 'is-stale' : ''}>
            <ProductGrid products={products.data.content} label={`Gifts from ${s.storeName}`} />
          </div>
        )}
        {products.data && <Pagination page={products.data.page} totalPages={products.data.totalPages} onChange={setPage} />}
      </div>
    </>
  );
}
