import { Link } from 'react-router';
import SafeImg from '../common/SafeImg.jsx';
import { StatusPill } from '../common/ui.jsx';
import { DELIVERY_LABEL, inr } from '../../lib/format.js';
import { CUSTOMER_FULFILMENT } from '../../lib/marketplace.js';

// An order's lines and totals: shown to customers (order page, tracking) and in Store Admin.

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
