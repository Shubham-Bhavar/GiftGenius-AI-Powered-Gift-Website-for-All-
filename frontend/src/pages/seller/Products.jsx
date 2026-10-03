import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import SafeImg from '../../components/SafeImg.jsx';
import { EmptyState, Pagination, StatusPill } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { api } from '../../lib/api.js';
import { date, inr, titleCase } from '../../lib/format.js';
import { PRODUCT_STATUS, SELLER_CATEGORIES, productState } from '../../lib/marketplace.js';
import { canEditProducts, LoadError, Skeleton, useStore } from './shared.jsx';

const STATUS_FILTERS = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'OUT_OF_STOCK', 'REJECTED', 'ARCHIVED'];
const SORTS = { newest: 'Newest first', oldest: 'Oldest first', name: 'Name A–Z', price_asc: 'Price: low to high', price_desc: 'Price: high to low', stock: 'Lowest stock' };

export function SellerProducts() {
  useDocumentTitle('My Products');
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const status = params.get('status') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const store = useStore();
  const products = useQuery({
    queryKey: ['seller', 'products', q, status, category, sort, page],
    queryFn: () => api.seller.products({ q: q || undefined, status: status || undefined, category: category || undefined, sort, page, size: 20 }),
    placeholderData: keepPreviousData,
  });
  const setFilter = (k) => (e) => {
    const next = new URLSearchParams(params);
    if (e.target.value) next.set(k, e.target.value);
    else next.delete(k);
    setParams(next, { replace: true });
    setPage(0);
  };
  const canSubmit = store.data?.status === 'APPROVED';
  const canEdit = canEditProducts(store.data?.status);
  const filtered = !!(q || status || category);

  const act = async (fn, done) => {
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ['seller'] });
      toast(done);
    } catch (err) {
      toast(err.message, 'bad');
    }
  };
  const archive = (p) => {
    if (!window.confirm(`Remove "${p.name}" from sale? It is archived: past orders keep it, and you can submit it again later.`)) return;
    act(() => api.seller.archiveProduct(p.id), `${p.name} archived`);
  };

  return (
    <>
      <div className="adm-toolbar">
        <div className="search-wrap">
          <label htmlFor="sel-q" className="sr-only">Search your products</label>
          <input id="sel-q" type="search" placeholder="Search your products…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        <label htmlFor="sel-status" className="sr-only">Status</label>
        <select id="sel-status" className="sort-select" value={status} onChange={setFilter('status')}>
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{PRODUCT_STATUS[s].label}</option>)}
        </select>
        <label htmlFor="sel-category" className="sr-only">Category</label>
        <select id="sel-category" className="sort-select" value={category} onChange={setFilter('category')}>
          <option value="">All categories</option>
          {SELLER_CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
        </select>
        <label htmlFor="sel-sort" className="sr-only">Sort</label>
        <select id="sel-sort" className="sort-select" value={sort} onChange={setFilter('sort')}>
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {canEdit && <Link to="/seller/products/new" className="btn-primary btn-sm">+ Add Product</Link>}
      </div>

      {products.isPending && <Skeleton lines={5} label="Loading your products…" />}
      {products.error && <LoadError what="your products" error={products.error} onRetry={() => products.refetch()} />}
      {products.data?.content.length === 0 && (filtered ? (
        <p className="co-muted">No products match these filters.</p>
      ) : (
        <EmptyState icon="🎁" title="No products yet."
          action={canEdit ? <Link to="/seller/products/new" className="btn-primary">+ Add Your First Product</Link> : null}>
          {canEdit ? 'Add your first product to start selling.' : "Your store can't add products right now."}
        </EmptyState>
      ))}
      {products.data?.content.length > 0 && (
        <div className={`adm-table-wrap sel-table-wrap ${products.isPlaceholderData ? 'is-stale' : ''}`} role="region" aria-label="Your products" tabIndex={0}>
          <table className="adm-table sel-table">
            <thead>
              <tr><th><span className="sr-only">Photo</span></th><th>Product</th><th>Category</th><th className="num">Price</th>
                <th className="num">Stock</th><th>Status</th><th>Created</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {products.data.content.map((p) => {
                const state = productState(p);
                const submittable = ['DRAFT', 'REJECTED', 'ARCHIVED'].includes(p.status);
                return (
                  <tr key={p.id}>
                    <td className="adm-thumb"><SafeImg src={p.image} alt="" /></td>
                    <td data-label="Product">
                      <Link to={`/seller/products/${p.id}/edit`} className="adm-link">{p.name}</Link>
                      {p.rejectionReason && <small className="sel-reason">Rejected: {p.rejectionReason}</small>}
                    </td>
                    <td data-label="Category">{titleCase(p.category)}</td>
                    <td data-label="Price" className="num">{inr(p.price)}</td>
                    <td data-label="Stock" className={`num ${p.stock === 0 ? 'text-bad' : ''}`}>{p.stock}</td>
                    <td data-label="Status"><StatusPill status={state} labels={PRODUCT_STATUS} /></td>
                    <td data-label="Created">{date(p.createdAt)}</td>
                    <td className="sel-row-actions">
                      <Link to={`/seller/products/${p.id}/edit`} className="btn-outline btn-sm" aria-label={`Edit ${p.name}`}>Edit</Link>
                      {p.active && <Link to={`/product/${p.id}`} className="btn-outline btn-sm" aria-label={`View ${p.name} in the shop`}>View</Link>}
                      {submittable && canSubmit && (
                        <button type="button" className="btn-outline btn-sm" aria-label={`Submit ${p.name} for approval`}
                          onClick={() => act(() => api.seller.submitProduct(p.id), `${p.name} sent for approval`)}>Submit</button>
                      )}
                      {canEdit && p.status !== 'ARCHIVED' && (
                        <button type="button" className="btn-outline btn-sm sel-danger" aria-label={`Archive ${p.name}`} onClick={() => archive(p)}>Archive</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {products.data && <Pagination page={products.data.page} totalPages={products.data.totalPages} onChange={setPage} />}
    </>
  );
}
