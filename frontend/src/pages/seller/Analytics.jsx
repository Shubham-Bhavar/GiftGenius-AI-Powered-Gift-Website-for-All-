import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { api } from '../../lib/api.js';
import { inr } from '../../lib/format.js';
import { Kpi, LoadError, Skeleton } from './shared.jsx';

export function SellerAnalytics() {
  useDocumentTitle('Seller Analytics');
  const data = useQuery({ queryKey: ['seller', 'analytics'], queryFn: api.seller.analytics });
  if (data.isPending) return <Skeleton kpis={5} label="Loading your sales…" />;
  if (data.error) return <LoadError what="your sales" error={data.error} onRetry={() => data.refetch()} />;
  const { stats, topProducts } = data.data;
  return (
    <>
      <div className="adm-kpis">
        <Kpi label="Gross sales" value={inr(stats.grossSales)} />
        <Kpi label="Orders" value={stats.orders} />
        <Kpi label="Units sold" value={stats.unitsSold} />
        <Kpi label="Average order value" value={inr(stats.averageOrderValue)} />
        <Kpi label="Cancelled orders" value={stats.cancelledOrders} />
      </div>
      <p className="co-muted sel-fine">
        Sales count confirmed orders (paid online, or cash on delivery) that weren&apos;t cancelled, at the prices shoppers paid,
        before order-wide coupons. This is revenue, not profit: product costs aren&apos;t recorded.
      </p>
      <section className="od-card" aria-labelledby="sel-top-h">
        <h2 id="sel-top-h">🏆 Top Products</h2>
        {topProducts.length === 0 ? (
          <p className="co-muted">No sales yet. Your best sellers will appear here.</p>
        ) : (
          <div className="adm-table-wrap sel-table-wrap" role="region" aria-label="Top products" tabIndex={0}>
            <table className="adm-table sel-table">
              <thead><tr><th>Product</th><th className="num">Units sold</th><th className="num">Sales</th></tr></thead>
              <tbody>
                {topProducts.map((t) => (
                  <tr key={t.productId}>
                    <td data-label="Product"><Link to={`/seller/products/${t.productId}/edit`} className="adm-link">{t.name}</Link></td>
                    <td data-label="Units sold" className="num">{t.unitsSold}</td>
                    <td data-label="Sales" className="num">{inr(t.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="od-card" aria-labelledby="sel-catalog-h">
        <h2 id="sel-catalog-h">🎁 Catalogue</h2>
        <dl className="sel-facts">
          <div><dt>Listed in the shop</dt><dd>{stats.listedProducts}</dd></div>
          <div><dt>Awaiting approval</dt><dd>{stats.pendingProducts}</dd></div>
          <div><dt>Drafts</dt><dd>{stats.draftProducts}</dd></div>
          <div><dt>Rejected</dt><dd>{stats.rejectedProducts}</dd></div>
          <div><dt>Out of stock</dt><dd>{stats.outOfStockProducts}</dd></div>
        </dl>
      </section>
    </>
  );
}
