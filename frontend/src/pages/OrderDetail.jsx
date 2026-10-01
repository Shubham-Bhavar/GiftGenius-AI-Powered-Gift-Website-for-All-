import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import OrderTimeline from '../components/OrderTimeline.jsx';
import SafeImg from '../components/SafeImg.jsx';
import { StepsBar } from '../components/CheckoutParts.jsx';
import { EmptyState, ErrorNote, Notice, PaymentPill, Spinner, StatusPill } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { usePayment } from '../hooks/usePayment.js';
import { api } from '../lib/api.js';
import { CANCELLABLE, DELIVERY_LABEL, dateTime, inr } from '../lib/format.js';
import { CUSTOMER_FULFILMENT } from '../lib/marketplace.js';

export function OrderItems({ items }) {
  return (
    <div className="od-items">
      {items.map((i, idx) => (
        <div className="od-mini-item" key={`${i.productId}-${idx}`}>
          <SafeImg src={i.image} alt={i.name} />
          <div>
            <Link to={`/product/${i.productId}`} className="od-mini-name">{i.name}</Link>
            <div className="od-mini-sub">Qty: {i.quantity} · 🎀 Gift Wrapped</div>
            {i.seller && (
              <div className="od-mini-sub">
                Sold by <Link to={`/store/${encodeURIComponent(i.seller.slug)}`}>{i.seller.storeName}</Link>
                {i.fulfillmentStatus && <> · <StatusPill status={i.fulfillmentStatus} labels={CUSTOMER_FULFILMENT} /></>}
              </div>
            )}
            {i.fulfillmentNote && <div className="od-mini-sub">🚚 {i.fulfillmentNote}</div>}
            {i.customName && <div className="od-mini-sub">✍️ {i.customName}</div>}
            {i.customMessage && <div className="od-mini-sub">💌 “{i.customMessage}”</div>}
          </div>
          <div className="od-mini-price">{inr(i.lineTotal)}</div>
        </div>
      ))}
    </div>
  );
}

export function OrderTotals({ order }) {
  return (
    <dl className="co-rows od-totals">
      <div className="co-row"><dt>Subtotal</dt><dd>{inr(order.subtotal)}</dd></div>
      {Number(order.discount) > 0 && <div className="co-row co-row--discount"><dt>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</dt><dd>−{inr(order.discount)}</dd></div>}
      <div className="co-row"><dt>Delivery ({DELIVERY_LABEL[order.deliveryType]})</dt><dd>{Number(order.deliveryFee) === 0 ? 'Free' : inr(order.deliveryFee)}</dd></div>
      <div className="co-row co-row--total"><dt>Total</dt><dd>{inr(order.total)}</dd></div>
    </dl>
  );
}

export default function OrderDetail() {
  const { number } = useParams();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const pay = usePayment();
  const [busy, setBusy] = useState(false);
  const order = useQuery({
    queryKey: ['orders', number],
    queryFn: () => api.order(number),
    // While payment is pending, look again now and then: the Razorpay webhook may confirm it at any moment.
    refetchInterval: (q) => (q.state.data?.status === 'PENDING_PAYMENT' ? 15_000 : false),
  });
  useDocumentTitle(`Order ${number}`);

  if (order.isPending) return <Spinner label="Loading your order…" />;
  if (order.error) {
    return (
      <div className="gg-page">
        {order.error.status === 404
          ? <EmptyState level={1} icon="📦" title="Order not found" action={<Link to="/account/orders" className="btn-primary">My Orders →</Link>} />
          : <ErrorNote error={order.error} onRetry={() => order.refetch()} />}
      </div>
    );
  }
  const o = order.data;
  const justPlaced = params.get('placed') === '1' && o.status !== 'PENDING_PAYMENT' && o.status !== 'CANCELLED';

  const cancel = async () => {
    if (!window.confirm('Cancel this order? Your items go back on the shelf.')) return;
    setBusy(true);
    try {
      qc.setQueryData(['orders', number], await api.cancelOrder(number));
      qc.invalidateQueries({ queryKey: ['orders', 'list'] });
      toast('Your order is cancelled');
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const payNow = async () => {
    setBusy(true);
    await pay(o);
    await order.refetch();
    setBusy(false);
  };

  return (
    <>
      <h1 className="sr-only">Order {o.orderNumber}</h1>
      {justPlaced && (
        <>
          <StepsBar current={4} />
          <section className="od-success" role="status">
            <div className="od-success-icon" aria-hidden="true">🎉</div>
            <h2>Order Placed Successfully!</h2>
            <p>Thank you! Your gift is being packed with love 💕</p>
            <div className="od-order-id">Order ID: {o.orderNumber}</div>
            <p className="od-success-note">We&apos;ve emailed a confirmation to <strong>{o.shipping.email}</strong>.</p>
            <div className="od-success-actions">
              <a className="btn-primary" href="#tracking">📦 Track Your Order</a>
              <Link to="/shop" className="btn-outline">← Continue Shopping</Link>
            </div>
          </section>
        </>
      )}

      <div className="od-page">
        <Link to="/account/orders" className="link-arrow od-back">← All orders</Link>
        <div className="od-header">
          <div>
            <div className="od-label">Order ID</div>
            <div className="od-id">{o.orderNumber}</div>
            <div className="od-date">Placed on {dateTime(o.createdAt)}</div>
          </div>
          <div className="od-header-right">
            <div className="od-label">Delivery Status</div>
            <div className="od-pills"><StatusPill status={o.status} /><PaymentPill status={o.paymentStatus} method={o.paymentMethod} orderStatus={o.status} /></div>
          </div>
        </div>

        {o.status === 'PENDING_PAYMENT' && o.payment && (
          <Notice tone="warn">
            <span>Complete payment within 30 minutes to confirm this order.</span>
            <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={payNow}>Pay {inr(o.total)} now →</button>
          </Notice>
        )}
        {o.paymentStatus === 'REFUND_PENDING' && (
          <Notice tone="info">Your refund of {inr(o.total)} is being processed and usually arrives in 5–7 working days.</Notice>
        )}

        <div className="od-card" id="tracking">
          <h2>🗺️ Order Timeline</h2>
          <OrderTimeline status={o.status} timeline={o.timeline} paymentMethod={o.paymentMethod} paymentStatus={o.paymentStatus} />
        </div>

        <div className="od-grid">
          <div className="od-card">
            <h2>Order Details</h2>
            <div className="od-detail-row"><span>Order Date</span><span>{dateTime(o.createdAt)}</span></div>
            <div className="od-detail-row"><span>Delivery To</span>
              <span>{o.shipping.fullName}<br />{o.shipping.addressLine}, {o.shipping.city}{o.shipping.state ? `, ${o.shipping.state}` : ''} {o.shipping.pincode}<br />{o.shipping.phone}</span>
            </div>
            <div className="od-detail-row"><span>Delivery</span><span>{DELIVERY_LABEL[o.deliveryType]}</span></div>
            <div className="od-detail-row"><span>Payment Method</span><span>{o.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Online (Razorpay)'}</span></div>
            <div className="od-detail-row"><span>Order Total</span><span>{inr(o.total)}</span></div>
          </div>
          <div className="od-card">
            <h2>Items in This Order</h2>
            <OrderItems items={o.items} />
            <OrderTotals order={o} />
          </div>
        </div>

        {CANCELLABLE.has(o.status) && (
          // Once a seller has sent their part, the order can't be cancelled any more (the API refuses too).
          o.items.some((i) => ['SHIPPED', 'DELIVERED'].includes(i.fulfillmentStatus)) ? (
            <div className="od-cancel">
              <p className="co-muted">Part of this order has already shipped, so it can&apos;t be cancelled online. <Link to="/contact">Contact us</Link> and we&apos;ll help.</p>
            </div>
          ) : (
            <div className="od-cancel">
              <button type="button" className="btn-outline" disabled={busy} onClick={cancel}>Cancel order</button>
              <p className="co-muted">Free cancellation until your gift ships.</p>
            </div>
          )
        )}
      </div>
    </>
  );
}
