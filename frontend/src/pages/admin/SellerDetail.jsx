import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorNote, Field, Notice, Spinner, StatusPill } from '../../components/common/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, adminKeys, adminQueries } from '../../services/admin.js';
import { date, inr, orderItemsLabel, titleCase } from '../../utils/format.js';
import { FULFILMENT_STATUS, PRODUCT_STATUS, SELLER_STATUS, productState } from '../../constants/marketplace.js';
import { catalogKeys } from '../../services/catalog.js';

/** Approve, reject, suspend or reactivate a store. Rejecting and suspending need a reason the seller sees. */
function SellerActions({ seller, onChanged }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const status = seller.store.status;

  const run = async (fn, message, needsReason) => {
    if (needsReason && !reason.trim()) {
      setError(new Error('Give a reason the seller will see.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChanged(await fn());
      toast(message);
      setReason('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const needsReasonField = status === 'PENDING' || status === 'APPROVED';

  return (
    <div className="adm-status-form">
      {needsReasonField && (
        <Field label={status === 'APPROVED' ? 'Reason for suspending' : 'Reason (needed to reject)'} as="textarea" rows={2} maxLength={500}
          value={reason} onChange={(e) => setReason(e.target.value)} hint="The seller sees this reason." />
      )}
      <div className="adm-actions">
        {(status === 'PENDING' || status === 'REJECTED') && (
          <button type="button" className="btn-primary btn-sm" disabled={busy}
            onClick={() => run(() => adminApi.approveSeller(seller.id), `${seller.store.storeName} approved ✓`)}>✓ Approve Store</button>
        )}
        {status === 'PENDING' && (
          <button type="button" className="btn-outline btn-sm" disabled={busy}
            onClick={() => run(() => adminApi.rejectSeller(seller.id, reason.trim()), `${seller.store.storeName} rejected`, true)}>✕ Reject</button>
        )}
        {status === 'APPROVED' && (
          <button type="button" className="btn-outline btn-sm sel-danger" disabled={busy}
            onClick={() => run(() => adminApi.suspendSeller(seller.id, reason.trim()), `${seller.store.storeName} suspended`, true)}>Suspend Store</button>
        )}
        {status === 'SUSPENDED' && (
          <button type="button" className="btn-primary btn-sm" disabled={busy}
            onClick={() => run(() => adminApi.reactivateSeller(seller.id), `${seller.store.storeName} reactivated ✓`)}>Reactivate Store</button>
        )}
      </div>
      {error && <div className="gg-alert gg-alert--error" role="alert">{error.message}</div>}
    </div>
  );
}

export function AdminSellerDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const detail = useQuery(adminQueries.seller(id));
  if (detail.isPending) return <Spinner />;
  if (detail.error) {
    return detail.error.status === 404
      ? <EmptyState icon="🏪" title="Seller not found" action={<Link to="/admin/sellers" className="btn-primary">All Sellers →</Link>} />
      : <ErrorNote error={detail.error} onRetry={() => detail.refetch()} />;
  }
  const d = detail.data;
  const st = d.store;
  const changed = (next) => {
    qc.setQueryData(adminKeys.seller(id), next);
    [adminKeys.sellers(), adminKeys.products(), adminKeys.stats()].forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    qc.invalidateQueries({ queryKey: catalogKeys.products() });
  };
  return (
    <>
      <Link to="/admin/sellers" className="co-continue">← All sellers</Link>
      <section className="od-card" aria-labelledby="adm-seller-h">
        <div className="sel-card-head">
          <h2 id="adm-seller-h">🏪 {st.storeName}</h2>
          <StatusPill status={st.status} labels={SELLER_STATUS} />
        </div>
        {st.statusReason && <Notice tone="warn">Reason given: {st.statusReason}</Notice>}
        <SellerActions seller={d} onChanged={changed} />
        <dl className="sel-facts">
          <div><dt>Seller</dt><dd>{d.sellerName}</dd></div>
          <div><dt>Email</dt><dd><a href={`mailto:${d.email}`}>{d.email}</a></dd></div>
          <div><dt>Store phone</dt><dd>{st.phone}</dd></div>
          <div><dt>Category</dt><dd>{titleCase(st.businessCategory)}</dd></div>
          <div><dt>Address</dt><dd>{st.addressLine}, {st.city}, {st.state} {st.pincode}</dd></div>
          <div><dt>Support email</dt><dd>{st.supportEmail ?? '—'}</dd></div>
          <div><dt>Store page</dt><dd>{st.status === 'APPROVED' ? <Link to={`/store/${st.slug}`}>/store/{st.slug}</Link> : `/store/${st.slug}`}</dd></div>
          <div><dt>Applied</dt><dd>{date(st.createdAt)}{st.reviewedAt ? ` · last reviewed ${date(st.reviewedAt)}` : ''}</dd></div>
          <div><dt>Account</dt><dd>{d.accountEnabled ? 'Active' : 'Blocked'}</dd></div>
        </dl>
        {st.description && <p className="adm-drawer-text">{st.description}</p>}
      </section>

      <div className="adm-kpis">
        <div className="adm-kpi"><span>Products</span><strong>{d.stats.totalProducts}</strong></div>
        <div className="adm-kpi"><span>Listed</span><strong>{d.stats.listedProducts}</strong></div>
        <div className="adm-kpi"><span>Awaiting approval</span><strong>{d.stats.pendingProducts}</strong></div>
        <div className="adm-kpi"><span>Orders</span><strong>{d.stats.orders}</strong></div>
        <div className="adm-kpi"><span>Gross sales</span><strong>{inr(d.stats.grossSales)}</strong></div>
      </div>

      <section className="od-card" aria-labelledby="adm-seller-products">
        <h2 id="adm-seller-products">🎁 Products</h2>
        {d.products.length === 0 ? <p className="co-muted">No products yet.</p> : (
          <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Seller products">
            <table className="adm-table">
              <thead><tr><th>Product</th><th className="num">Price</th><th className="num">Stock</th><th>Review</th><th>Updated</th></tr></thead>
              <tbody>
                {d.products.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/admin/products?edit=${p.id}`} className="adm-link">{p.name}</Link></td>
                    <td className="num">{inr(p.price)}</td>
                    <td className="num">{p.stock}</td>
                    <td><StatusPill status={productState(p)} labels={PRODUCT_STATUS} /></td>
                    <td>{date(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="od-card" aria-labelledby="adm-seller-orders">
        <h2 id="adm-seller-orders">📦 Recent Orders</h2>
        {d.recentOrders.length === 0 ? <p className="co-muted">No orders yet.</p> : (
          <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Seller orders">
            <table className="adm-table">
              <thead><tr><th>Order</th><th>Their items</th><th className="num">Their total</th><th>Their status</th><th>Order</th><th>Placed</th></tr></thead>
              <tbody>
                {d.recentOrders.map((o) => (
                  <tr key={o.orderNumber}>
                    <td>{o.orderNumber}</td>
                    <td>{orderItemsLabel(o)}</td>
                    <td className="num">{inr(o.sellerTotal)}</td>
                    <td><StatusPill status={o.fulfillmentStatus} labels={FULFILMENT_STATUS} /></td>
                    <td><StatusPill status={o.orderStatus} /></td>
                    <td>{date(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
