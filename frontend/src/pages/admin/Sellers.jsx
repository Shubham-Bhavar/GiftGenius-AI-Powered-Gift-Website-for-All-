import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ErrorNote, Pagination, Spinner, StatusPill } from '../../components/common/ui.jsx';
import { api } from '../../lib/api.js';
import { date, inr } from '../../lib/format.js';
import { SELLER_STATUS } from '../../lib/marketplace.js';

export function AdminSellers() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const status = params.get('status') ?? '';
  const sellers = useQuery({
    queryKey: ['admin', 'sellers', status, q, page],
    queryFn: () => api.admin.sellers({ status: status || undefined, q: q || undefined, page, size: 25 }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div className="adm-toolbar">
        <div className="search-wrap">
          <label htmlFor="adm-sq" className="sr-only">Search sellers</label>
          <input id="adm-sq" type="search" placeholder="Store, name or email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        <label htmlFor="adm-sstatus" className="sr-only">Seller status</label>
        <select id="adm-sstatus" className="sort-select" value={status}
          onChange={(e) => { setParams(e.target.value ? { status: e.target.value } : {}, { replace: true }); setPage(0); }}>
          <option value="">All sellers</option>
          {Object.entries(SELLER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <ErrorNote error={sellers.error} onRetry={() => sellers.refetch()} />
      <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Sellers table">
        <table className="adm-table">
          <thead><tr><th>Store</th><th>Seller</th><th>Email</th><th>Status</th><th className="num">Products</th><th className="num">Orders</th><th className="num">Revenue</th><th>Joined</th></tr></thead>
          <tbody>
            {sellers.isPending && <tr><td colSpan={8}><Spinner inline /></td></tr>}
            {sellers.data?.content.length === 0 && <tr><td colSpan={8} className="co-muted">No sellers here.</td></tr>}
            {sellers.data?.content.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/admin/sellers/${s.id}`} className="adm-link">{s.storeName}</Link></td>
                <td>{s.sellerName}</td>
                <td>{s.email}</td>
                <td><StatusPill status={s.status} labels={SELLER_STATUS} /></td>
                <td className="num">{s.productCount}{s.pendingProducts > 0 ? ` (${s.pendingProducts} to review)` : ''}</td>
                <td className="num">{s.orderCount}</td>
                <td className="num">{inr(s.revenue)}</td>
                <td>{date(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sellers.data && <Pagination page={sellers.data.page} totalPages={sellers.data.totalPages} onChange={setPage} />}
    </>
  );
}
