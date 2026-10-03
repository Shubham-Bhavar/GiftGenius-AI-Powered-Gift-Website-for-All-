import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ErrorNote, Spinner } from '../../components/common/ui.jsx';
import { adminQueries } from '../../services/admin.js';
import { inr } from '../../lib/format.js';
import { TO_SHIP } from './Orders.jsx';

export function AdminDashboard() {
  const stats = useQuery({ ...adminQueries.stats(), refetchInterval: 60_000 });
  if (stats.isPending) return <Spinner />;
  if (stats.error) return <ErrorNote error={stats.error} onRetry={() => stats.refetch()} />;
  const s = stats.data;
  return (
    <>
      <div className="adm-kpis">
        <div className="adm-kpi"><span>Orders · 30 days</span><strong>{s.ordersLast30Days}</strong></div>
        <div className="adm-kpi"><span>Paid revenue · 30 days</span><strong>{inr(s.paidRevenueLast30Days)}</strong></div>
        <Link to={`/admin/orders?status=${TO_SHIP}`} className="adm-kpi adm-kpi--link"><span>To pack &amp; ship</span><strong>{s.awaitingDispatch}</strong></Link>
        <Link to="/admin/orders?status=PENDING_PAYMENT" className="adm-kpi adm-kpi--link"><span>Awaiting payment</span><strong>{s.awaitingPayment}</strong></Link>
        <Link to="/admin/sellers?status=PENDING" className="adm-kpi adm-kpi--link"><span>Sellers to review</span><strong>{s.sellersAwaitingReview ?? 0}</strong></Link>
        <Link to="/admin/products?status=PENDING_APPROVAL" className="adm-kpi adm-kpi--link"><span>Products to approve</span><strong>{s.productsAwaitingApproval ?? 0}</strong></Link>
      </div>
      <div className="od-card">
        <h2>⚠️ Low Stock</h2>
        {s.lowStock.length === 0 ? <p className="co-muted">Every product has 10 or more in stock.</p> : (
          <table className="adm-table">
            <thead><tr><th>Product</th><th className="num">In stock</th></tr></thead>
            <tbody>
              {s.lowStock.map((p) => (
                <tr key={p.id}><td><Link to={`/admin/products?edit=${p.id}`}>{p.name}</Link></td><td className={`num ${p.stock === 0 ? 'text-bad' : ''}`}>{p.stock}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
