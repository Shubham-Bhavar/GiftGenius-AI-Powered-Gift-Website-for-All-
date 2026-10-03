import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import SafeImg from '../../components/SafeImg.jsx';
import { ErrorNote, Pagination, Spinner, StatusPill } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { inr } from '../../lib/format.js';
import { PRODUCT_STATUS } from '../../lib/marketplace.js';
import { ProductForm } from './ProductForm.jsx';
import { ReviewPanel } from './ProductReview.jsx';

const OWNERS = { '': 'All sellers', platform: 'GiftGenius', marketplace: 'Marketplace sellers' };

export function AdminProducts() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const editParam = params.get('edit');
  const editing = editParam === null ? null : Number(editParam);
  const status = params.get('status') ?? '';
  const owner = params.get('owner') ?? '';
  const setEditing = (id) => {
    const next = new URLSearchParams(params);
    if (id === null) next.delete('edit');
    else next.set('edit', String(id));
    setParams(next);
  };
  const setFilter = (k) => (e) => {
    const next = new URLSearchParams(params);
    if (e.target.value) next.set(k, e.target.value);
    else next.delete(k);
    setParams(next, { replace: true });
    setPage(0);
  };

  const products = useQuery({
    queryKey: ['admin', 'products', q, status, owner, page],
    queryFn: () => api.admin.products({ q: q || undefined, status: status || undefined, owner: owner || undefined, page, size: 25 }),
    placeholderData: keepPreviousData,
  });
  const one = useQuery({
    queryKey: ['admin', 'product', editing],
    queryFn: () => api.admin.product(editing),
    enabled: editing !== null && editing !== 0,
  });

  if (editing !== null) {
    if (editing === 0) return <ProductForm product={null} onDone={() => setEditing(null)} />;
    if (one.isPending) return <Spinner />;
    if (one.error) return <ErrorNote error={one.error} onRetry={() => one.refetch()} />;
    const product = one.data;
    return (
      <>
        {product.seller && <ReviewPanel product={product} onDone={() => setEditing(null)} />}
        <ProductForm key={product.id} product={product} onDone={() => setEditing(null)} />
      </>
    );
  }

  return (
    <>
      <div className="adm-toolbar">
        <div className="search-wrap">
          <label htmlFor="adm-q" className="sr-only">Search products</label>
          <input id="adm-q" type="search" placeholder="Search products…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        <label htmlFor="adm-pstatus" className="sr-only">Review status</label>
        <select id="adm-pstatus" className="sort-select" value={status} onChange={setFilter('status')}>
          <option value="">All statuses</option>
          <option value="PENDING_APPROVAL">Awaiting approval</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="DRAFT">Drafts</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <label htmlFor="adm-owner" className="sr-only">Sold by</label>
        <select id="adm-owner" className="sort-select" value={owner} onChange={setFilter('owner')}>
          {Object.entries(OWNERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" className="btn-primary btn-sm" onClick={() => setEditing(0)}>+ New Product</button>
      </div>
      <ErrorNote error={products.error} onRetry={() => products.refetch()} />
      <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Products table">
        <table className="adm-table">
          <thead><tr><th><span className="sr-only">Photo</span></th><th>Product</th><th>Sold by</th><th>Category</th><th className="num">Price</th><th className="num">Stock</th><th>Review</th><th>Shop</th></tr></thead>
          <tbody>
            {products.isPending && <tr><td colSpan={8}><Spinner inline /></td></tr>}
            {products.data?.content.length === 0 && <tr><td colSpan={8} className="co-muted">No products here.</td></tr>}
            {products.data?.content.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'is-muted'}>
                <td className="adm-thumb"><SafeImg src={p.image} alt="" /></td>
                <td><button type="button" className="adm-link" onClick={() => setEditing(p.id)}>{p.name}</button></td>
                <td>{p.seller?.storeName ?? 'GiftGenius'}</td>
                <td>{p.category}</td>
                <td className="num">{inr(p.price)}</td>
                <td className={`num ${p.stock < 10 ? 'text-bad' : ''}`}>{p.stock}</td>
                <td><StatusPill status={p.status} labels={PRODUCT_STATUS} /></td>
                <td>{p.active ? 'Visible' : 'Hidden'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {products.data && <Pagination page={products.data.page} totalPages={products.data.totalPages} onChange={setPage} />}
    </>
  );
}
