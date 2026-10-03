import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import SafeImg from '../../components/common/SafeImg.jsx';
import { EmptyState, Field, Pagination, StatusPill } from '../../components/common/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { api } from '../../lib/api.js';
import { date, dateTime, inr, orderItemsLabel } from '../../lib/format.js';
import { FULFILMENT_STATUS } from '../../lib/marketplace.js';
import { LoadError, Skeleton, useStore } from './shared.jsx';

export function SellerOrders() {
  useDocumentTitle('Seller Orders');
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const status = params.get('status') ?? '';
  const orders = useQuery({
    queryKey: ['seller', 'orders', status, page],
    queryFn: () => api.seller.orders({ status: status || undefined, page, size: 20 }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div className="adm-toolbar">
        <label htmlFor="sel-ostatus" className="sr-only">Fulfilment status</label>
        <select id="sel-ostatus" className="sort-select" value={status}
          onChange={(e) => { setParams(e.target.value ? { status: e.target.value } : {}, { replace: true }); setPage(0); }}>
          <option value="">All orders</option>
          {Object.entries(FULFILMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button type="button" className="btn-outline btn-sm" onClick={() => orders.refetch()}>↻ Refresh</button>
      </div>
      <p className="co-muted sel-fine">You see only your own products in each order, with what you need to deliver them.</p>
      {orders.isPending && <Skeleton lines={5} label="Loading your orders…" />}
      {orders.error && <LoadError what="your orders" error={orders.error} onRetry={() => orders.refetch()} />}
      {orders.data?.content.length === 0 && (
        <EmptyState icon="📦" title={status ? 'No orders here.' : 'No orders yet.'}>
          {status ? 'Try another status.' : 'Orders appear here once shoppers buy your products.'}
        </EmptyState>
      )}
      {orders.data?.content.length > 0 && (
        <div className={`adm-table-wrap sel-table-wrap ${orders.isPlaceholderData ? 'is-stale' : ''}`} role="region" aria-label="Your orders" tabIndex={0}>
          <table className="adm-table sel-table">
            <thead><tr><th>Order</th><th>Your items</th><th className="num">Your total</th><th>Your status</th><th>Order</th><th>Ship to</th><th>Placed</th></tr></thead>
            <tbody>
              {orders.data.content.map((o) => (
                <tr key={o.orderNumber}>
                  <td data-label="Order"><Link to={`/seller/orders/${o.orderNumber}`} className="adm-link">{o.orderNumber}</Link></td>
                  <td data-label="Your items">{orderItemsLabel(o)}</td>
                  <td data-label="Your total" className="num">{inr(o.sellerTotal)}</td>
                  <td data-label="Your status"><StatusPill status={o.fulfillmentStatus} labels={FULFILMENT_STATUS} /></td>
                  <td data-label="Order"><StatusPill status={o.orderStatus} /></td>
                  <td data-label="Ship to">{o.shipCity}</td>
                  <td data-label="Placed" title={dateTime(o.createdAt)}>{date(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {orders.data && <Pagination page={orders.data.page} totalPages={orders.data.totalPages} onChange={setPage} />}
    </>
  );
}

export function SellerOrderDetail() {
  const { number } = useParams();
  useDocumentTitle(`Order ${number}`);
  const qc = useQueryClient();
  const toast = useToast();
  const store = useStore();
  const order = useQuery({ queryKey: ['seller', 'order', number], queryFn: () => api.seller.order(number) });
  const [next, setNext] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (order.isPending) return <Skeleton lines={6} label="Loading the order…" />;
  if (order.error) {
    if (order.error.status === 404) {
      return (
        <EmptyState icon="📦" title="Order not found" action={<Link to="/seller/orders" className="btn-primary">Back to Orders →</Link>}>
          It isn&apos;t one of your orders, or the link is wrong.
        </EmptyState>
      );
    }
    return <LoadError what="the order" error={order.error} onRetry={() => order.refetch()} />;
  }
  const o = order.data;
  const canUpdate = store.data?.status === 'APPROVED' && o.nextSteps.length > 0;

  const update = async (e) => {
    e.preventDefault();
    if (!next) {
      setError(new Error('Choose the new status.'));
      return;
    }
    if (/[<>]/.test(note)) {
      setError(new Error('Remove the < and > characters from the note.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.seller.updateOrder(number, next, note.trim() || undefined);
      qc.setQueryData(['seller', 'order', number], updated);
      qc.invalidateQueries({ queryKey: ['seller', 'orders'] });
      qc.invalidateQueries({ queryKey: ['seller', 'dashboard'] });
      toast(`Order ${number}: ${FULFILMENT_STATUS[updated.fulfillmentStatus].label}`);
      setNext('');
      setNote('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/seller/orders" className="co-continue">← All orders</Link>
      <div className="od-header">
        <div>
          <p className="od-label">Order</p>
          <h2 className="od-id">{o.orderNumber}</h2>
          <p className="co-muted">Placed {dateTime(o.createdAt)}</p>
        </div>
        <div className="od-pills">
          <StatusPill status={o.fulfillmentStatus} labels={FULFILMENT_STATUS} />
          <span className="gg-status gg-status--soft">{o.paymentMethod === 'COD' ? '💰 Cash on delivery' : '💳 Paid online'}</span>
        </div>
      </div>

      <div className="sel-grid">
        <section className="od-card" aria-labelledby="sel-items-h">
          <h2 id="sel-items-h">🎁 Your Items</h2>
          <ul className="sel-list">
            {o.items.map((i, idx) => (
              <li key={`${i.productId}-${idx}`}>
                <SafeImg src={i.image} alt="" />
                <div>
                  <span className="sel-list-title">{i.name}</span>
                  <small>Qty {i.quantity} × {inr(i.unitPrice)}</small>
                  {i.customName && <small>✍️ Personalise with: {i.customName}</small>}
                  {i.customMessage && <small>💌 Gift card: “{i.customMessage}”</small>}
                </div>
                <div className="sel-list-side">
                  <strong>{inr(i.lineTotal)}</strong>
                  <StatusPill status={i.fulfillmentStatus} labels={FULFILMENT_STATUS} />
                </div>
              </li>
            ))}
          </ul>
          <p className="sel-total"><span>Your total</span><strong>{inr(o.sellerTotal)}</strong></p>
        </section>

        <section className="od-card" aria-labelledby="sel-ship-h">
          <h2 id="sel-ship-h">🚚 Ship To</h2>
          <address className="sel-address">
            <strong>{o.shipping.fullName}</strong><br />
            {o.shipping.addressLine}<br />
            {o.shipping.city}{o.shipping.state ? `, ${o.shipping.state}` : ''} {o.shipping.pincode}<br />
            📞 <a href={`tel:${o.shipping.phone.replace(/[^+0-9]/g, '')}`}>{o.shipping.phone}</a>
          </address>
          <p className="co-muted sel-fine">Customer order status: <StatusPill status={o.orderStatus} /></p>
        </section>
      </div>

      <section className="od-card" aria-labelledby="sel-update-h">
        <h2 id="sel-update-h">📬 Update Your Status</h2>
        {o.orderStatus === 'CANCELLED' || o.fulfillmentStatus === 'CANCELLED' ? (
          <p className="co-muted">This order was cancelled. There&apos;s nothing to send.</p>
        ) : o.nextSteps.length === 0 ? (
          <p className="co-muted">All done: your items were delivered. 🎉</p>
        ) : !canUpdate ? (
          <p className="co-muted">Your store isn&apos;t active, so GiftGenius handles this order for now.</p>
        ) : (
          <form className="adm-status-form" onSubmit={update} noValidate>
            <Field label="New status" as="select" value={next} onChange={(e) => setNext(e.target.value)}>
              <option value="">Choose…</option>
              {o.nextSteps.map((s) => <option key={s} value={s}>{FULFILMENT_STATUS[s].label}</option>)}
            </Field>
            <Field label="Note for the customer (optional)" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Courier: DTDC, tracking 123456" />
            {error && <div className="gg-alert gg-alert--error" role="alert">{error.message}</div>}
            <button className="btn-primary" disabled={busy}>{busy ? 'Updating…' : 'Update Status →'}</button>
          </form>
        )}
      </section>
    </>
  );
}
