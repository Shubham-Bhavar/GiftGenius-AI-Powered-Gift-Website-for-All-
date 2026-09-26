import { useState } from 'react';
import { useSearchParams } from 'react-router';
import OrderTimeline from '../components/OrderTimeline.jsx';
import { StatusPill } from '../components/ui.jsx';
import { OrderItems } from './OrderDetail.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../lib/api.js';
import { DELIVERY_LABEL, dateTime, inr } from '../lib/format.js';

/** Public order tracking (structure of the original track page), backed by the real order timeline. */
export default function Track() {
  useDocumentTitle('Track Your Order');
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(params.get('order') ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [state, setState] = useState({ busy: false, result: null, error: null });

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, result: null, error: null });
    try {
      setState({ busy: false, result: await api.track(orderNumber.trim(), email.trim()), error: null });
    } catch (err) {
      setState({ busy: false, result: null, error: err });
    }
  };

  const r = state.result;
  return (
    <>
      <section className="page-hero">
        <h1>Track Your <em>Gift</em> 📦</h1>
        <p>Real-time updates on your order&apos;s journey</p>
      </section>
      <div className="gg-page gg-page--narrow">
        <form className="tr-search-card" onSubmit={submit}>
          <h2>Enter your Order ID</h2>
          <div className="tr-search-row">
            <label htmlFor="tr-order" className="sr-only">Order ID</label>
            <input id="tr-order" className="co-input" required placeholder="e.g. GG-7K2M9QXA" value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value.toUpperCase())} />
            <label htmlFor="tr-email" className="sr-only">Email used for the order</label>
            <input id="tr-email" className="co-input" required type="email" placeholder="Email used for the order" value={email}
              onChange={(e) => setEmail(e.target.value)} />
            <button className="tr-btn" disabled={state.busy}>{state.busy ? 'Tracking…' : 'Track 🔍'}</button>
          </div>
          {state.error && <div className="tr-error" role="alert">{state.error.message}</div>}
          <p className="tr-tip">💡 Tip: your Order ID is in your confirmation email and under My Orders. We ask for the email so only you can see your order.</p>
        </form>

        {r && (
          <div className="tr-result" aria-live="polite">
            <div className="od-header">
              <div>
                <div className="od-label">Order ID</div>
                <div className="od-id">{r.orderNumber}</div>
                <div className="od-date">Placed on {dateTime(r.createdAt)}</div>
              </div>
              <div className="od-header-right">
                <div className="od-label">Delivery Status</div>
                <StatusPill status={r.status} />
              </div>
            </div>
            <div className="od-card">
              <h2>🗺️ Order Timeline</h2>
              <OrderTimeline status={r.status} timeline={r.timeline} paymentMethod={r.paymentMethod} paymentStatus={r.paymentStatus} />
            </div>
            <div className="od-grid">
              <div className="od-card">
                <h2>Order Details</h2>
                <div className="od-detail-row"><span>Order Date</span><span>{dateTime(r.createdAt)}</span></div>
                <div className="od-detail-row"><span>Delivering To</span><span>{r.recipientFirstName}, {r.city}</span></div>
                <div className="od-detail-row"><span>Delivery</span><span>{DELIVERY_LABEL[r.deliveryType]}</span></div>
                <div className="od-detail-row"><span>Order Total</span><span>{inr(r.total)}</span></div>
              </div>
              <div className="od-card">
                <h2>Items in This Order</h2>
                <OrderItems items={r.items} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
