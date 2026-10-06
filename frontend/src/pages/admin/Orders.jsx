import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import OrderTimeline from '../../components/order/OrderTimeline.jsx';
import { ErrorNote, Field, Pagination, PaymentPill, Spinner, StatusPill } from '../../components/common/ui.jsx';
import { OrderItems, OrderTotals } from '../../components/order/OrderSummary.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, adminKeys, adminQueries } from '../../services/admin.js';
import { trapFocus } from '../../utils/focus.js';
import { date, dateTime, inr, orderItemsLabel } from '../../utils/format.js';
import { ORDER_STATUS } from '../../constants/orders.js';

const NEXT_STATUS = {
  PENDING_PAYMENT: ['CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** Orders that still need packing or shipping (what the dashboard's "To pack & ship" counts). */
export const TO_SHIP = 'CONFIRMED,PACKED';

function OrderDrawer({ number, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const order = useQuery(adminQueries.order(number));
  const [next, setNext] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const closeBtn = useRef(null);

  // Focus the drawer on open, close on Escape, and hand focus back to the order link on close.
  useEffect(() => {
    const opener = document.activeElement;
    closeBtn.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [onClose]);

  const update = async (e) => {
    e.preventDefault();
    if (next === 'CANCELLED' && !window.confirm('Cancel this order? Stock is released and paid orders are marked for refund.')) return;
    setBusy(true);
    try {
      const o = await adminApi.updateStatus(number, next, note.trim() || undefined);
      qc.setQueryData(adminKeys.order(number), o);
      qc.invalidateQueries({ queryKey: adminKeys.orders() });
      qc.invalidateQueries({ queryKey: adminKeys.stats() });
      toast(`Order ${number} → ${ORDER_STATUS[o.status].label}`);
      setNext('');
      setNote('');
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const o = order.data;
  return (
    <>
      <div className="cart-overlay open" onClick={onClose} aria-hidden="true" />
      <div className="cart-side adm-drawer" role="dialog" aria-modal="true" aria-label={`Order ${number}`} onKeyDown={trapFocus}>
        <div className="cart-hd">
          <h2>{number}</h2>
          <button type="button" className="cart-close-btn" aria-label="Close order details" ref={closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className="cart-body">
          {order.isPending && <Spinner />}
          <ErrorNote error={order.error} />
          {o && (
            <>
              <div className="od-pills"><StatusPill status={o.status} /><PaymentPill status={o.paymentStatus} method={o.paymentMethod} orderStatus={o.status} /></div>
              {NEXT_STATUS[o.status].length > 0 && (
                <form className="adm-status-form" onSubmit={update}>
                  <Field label="Move to" as="select" required value={next} onChange={(e) => setNext(e.target.value)}>
                    <option value="">Choose…</option>
                    {NEXT_STATUS[o.status].map((s) => <option key={s} value={s}>{ORDER_STATUS[s].label}</option>)}
                  </Field>
                  <Field label="Note for the customer (optional)" maxLength={255} value={note} placeholder="e.g. Tracking: DTDC 123456"
                    onChange={(e) => setNote(e.target.value)} />
                  <button className="btn-primary" disabled={busy || !next}>{busy ? 'Updating…' : 'Update Status →'}</button>
                </form>
              )}
              <h3 className="adm-drawer-h">Ship to</h3>
              <p className="adm-drawer-text">{o.shipping.fullName} · {o.shipping.phone} · {o.shipping.email}<br />
                {o.shipping.addressLine}, {o.shipping.city}{o.shipping.state ? `, ${o.shipping.state}` : ''} {o.shipping.pincode}</p>
              <h3 className="adm-drawer-h">Items</h3>
              <OrderItems items={o.items} />
              <OrderTotals order={o} />
              <h3 className="adm-drawer-h">Timeline</h3>
              <OrderTimeline status={o.status} timeline={o.timeline} paymentMethod={o.paymentMethod} paymentStatus={o.paymentStatus} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function AdminOrders() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(null);
  const closeDrawer = useCallback(() => setOpen(null), []);
  const orders = useQuery({
    ...adminQueries.orders({ status, page }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div className="adm-toolbar">
        <label htmlFor="adm-status" className="sr-only">Status</label>
        <select id="adm-status" className="sort-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">All orders</option>
          <option value={TO_SHIP}>To pack &amp; ship</option>
          {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button type="button" className="btn-outline btn-sm" onClick={() => orders.refetch()}>↻ Refresh</button>
      </div>
      <ErrorNote error={orders.error} />
      <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Orders table">
        <table className="adm-table">
          <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Sold by</th><th>Status</th><th>Payment</th><th className="num">Total</th><th>Placed</th></tr></thead>
          <tbody>
            {orders.isPending && <tr><td colSpan={8}><Spinner inline /></td></tr>}
            {orders.data?.content.length === 0 && <tr><td colSpan={8} className="co-muted">No orders here.</td></tr>}
            {orders.data?.content.map((o) => (
              <tr key={o.orderNumber}>
                <td><button type="button" className="adm-link" onClick={() => setOpen(o.orderNumber)}>{o.orderNumber}</button></td>
                <td>{o.customerEmail}</td>
                <td>{orderItemsLabel(o)}</td>
                <td>{o.sellers?.length ? o.sellers.join(', ') : 'GiftGenius'}</td>
                <td><StatusPill status={o.status} /></td>
                <td><PaymentPill status={o.paymentStatus} method={o.paymentMethod} orderStatus={o.status} /></td>
                <td className="num">{inr(o.total)}</td>
                <td title={dateTime(o.createdAt)}>{date(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {orders.data && <Pagination page={orders.data.page} totalPages={orders.data.totalPages} onChange={setPage} />}
      {open && <OrderDrawer number={open} onClose={closeDrawer} />}
    </>
  );
}
