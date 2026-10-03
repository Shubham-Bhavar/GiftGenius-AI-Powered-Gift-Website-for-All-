import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import SafeImg from '../../components/common/SafeImg.jsx';
import { StatusPill } from '../../components/common/ui.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { sellerQueries } from '../../services/seller.js';
import { date, inr, orderItemsLabel } from '../../lib/format.js';
import { FULFILMENT_STATUS, PRODUCT_STATUS, SELLER_STATUS, productState } from '../../lib/marketplace.js';
import { canEditProducts, Kpi, LoadError, Skeleton } from './shared.jsx';

function RecentOrders({ orders }) {
  if (orders.length === 0) return <p className="co-muted">No orders yet. Orders appear here once shoppers buy your products.</p>;
  return (
    <ul className="sel-list">
      {orders.map((o) => (
        <li key={o.orderNumber}>
          <SafeImg src={o.firstItemImage} alt="" />
          <div>
            <Link to={`/seller/orders/${o.orderNumber}`} className="sel-list-title">{o.orderNumber}</Link>
            <small>{orderItemsLabel(o)} · {date(o.createdAt)}</small>
          </div>
          <div className="sel-list-side">
            <strong>{inr(o.sellerTotal)}</strong>
            <StatusPill status={o.fulfillmentStatus} labels={FULFILMENT_STATUS} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecentProducts({ products, canEdit }) {
  if (products.length === 0) {
    return (
      <div className="sel-empty">
        <p><strong>No products yet.</strong> {canEdit ? 'Add your first product to start selling.' : "Your store can't add products right now."}</p>
        {canEdit && <Link to="/seller/products/new" className="btn-primary btn-sm">+ Add Product</Link>}
      </div>
    );
  }
  return (
    <ul className="sel-list">
      {products.map((p) => (
        <li key={p.id}>
          <SafeImg src={p.image} alt="" />
          <div>
            <Link to={`/seller/products/${p.id}/edit`} className="sel-list-title">{p.name}</Link>
            <small>{inr(p.price)} · {p.stock} in stock</small>
          </div>
          <div className="sel-list-side"><StatusPill status={productState(p)} labels={PRODUCT_STATUS} /></div>
        </li>
      ))}
    </ul>
  );
}

export function SellerDashboard() {
  useDocumentTitle('Seller Dashboard');
  const dash = useQuery(sellerQueries.dashboard());
  if (dash.isPending) return <Skeleton kpis={6} label="Loading your dashboard…" />;
  if (dash.error) return <LoadError what="your dashboard" error={dash.error} onRetry={() => dash.refetch()} />;
  const { store, stats, recentOrders, recentProducts } = dash.data;
  const canEdit = canEditProducts(store.status);
  return (
    <>
      <section className="sel-head" aria-labelledby="sel-dash-h">
        <div>
          <h2 id="sel-dash-h" className="sel-h">{store.storeName}</h2>
          <p className="co-muted">Store status: <StatusPill status={store.status} labels={SELLER_STATUS} /></p>
        </div>
        <div className="adm-actions">
          {canEdit && <Link to="/seller/products/new" className="btn-primary btn-sm">+ Add Product</Link>}
          <Link to="/seller/products" className="btn-outline btn-sm">Manage Products</Link>
          <Link to="/seller/orders" className="btn-outline btn-sm">Orders</Link>
          <Link to="/seller/settings" className="btn-outline btn-sm">Store Settings</Link>
          {store.status === 'APPROVED' && <Link to={`/store/${store.slug}`} className="btn-outline btn-sm">View My Store ↗</Link>}
        </div>
      </section>

      <div className="adm-kpis">
        <Kpi label="Total products" value={stats.totalProducts} to="/seller/products" />
        <Kpi label="Listed in the shop" value={stats.listedProducts} to="/seller/products?status=APPROVED" />
        <Kpi label="Awaiting approval" value={stats.pendingProducts} to="/seller/products?status=PENDING_APPROVAL" />
        <Kpi label="Orders" value={stats.orders} to="/seller/orders" note={stats.ordersToFulfil ? `${stats.ordersToFulfil} to pack or ship` : null} />
        <Kpi label="Units sold" value={stats.unitsSold} />
        <Kpi label="Revenue" value={inr(stats.grossSales)} to="/seller/analytics" note="Sales, before coupons" />
      </div>

      <div className="sel-grid">
        <section className="od-card" aria-labelledby="sel-recent-orders">
          <div className="sel-card-head">
            <h2 id="sel-recent-orders">📦 Recent Orders</h2>
            {recentOrders.length > 0 && <Link to="/seller/orders">All orders →</Link>}
          </div>
          <RecentOrders orders={recentOrders} />
        </section>
        <section className="od-card" aria-labelledby="sel-recent-products">
          <div className="sel-card-head">
            <h2 id="sel-recent-products">🎁 Recent Products</h2>
            {recentProducts.length > 0 && <Link to="/seller/products">All products →</Link>}
          </div>
          <RecentProducts products={recentProducts} canEdit={canEdit} />
        </section>
      </div>
    </>
  );
}
