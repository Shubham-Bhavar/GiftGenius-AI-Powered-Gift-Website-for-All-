import { useState } from 'react';
import SafeImg from './SafeImg.jsx';
import { inr } from '../lib/format.js';

const STEPS = ['Cart', 'Delivery', 'Payment', 'Confirmed'];

/** "1 Cart — 2 Delivery — 3 Payment — 4 Confirmed" bar from the original cart page. */
export function StepsBar({ current }) {
  return (
    <div className="co-steps">
      <ol className="co-steps-inner" aria-label="Checkout progress">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n < current ? 'done' : n === current ? 'active' : '';
          return (
            <li key={label} className={`co-step ${state}`} aria-current={n === current ? 'step' : undefined}>
              <span className="co-step-num">{n < current ? '✓' : n}</span> {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function CouponBox({ quote, couponCode, onApply }) {
  const [code, setCode] = useState(couponCode || '');
  const apply = () => onApply(code.trim().toUpperCase());
  return (
    <div className="co-coupon">
      <label htmlFor="coupon" className="co-coupon-title">🎟️ Apply Coupon Code</label>
      <div className="co-coupon-row">
        <input id="coupon" className="co-input" value={code} maxLength={40} placeholder="Try GIFT20" autoComplete="off"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (code.trim()) apply(); } }} />
        {couponCode ? (
          <button type="button" className="co-btn-apply co-btn-apply--ghost" onClick={() => { setCode(''); onApply(''); }}>Remove</button>
        ) : (
          <button type="button" className="co-btn-apply" disabled={!code.trim()} onClick={apply}>Apply</button>
        )}
      </div>
      {couponCode && quote?.couponMessage && (
        <p className={`co-coupon-msg ${quote.couponStatus === 'APPLIED' ? 'ok' : 'bad'}`} role="status">
          {quote.couponStatus === 'APPLIED' ? '✓ ' : '✕ '}{quote.couponMessage}
        </p>
      )}
    </div>
  );
}

/** Right-hand "Order Summary" card: items, subtotal, discount, delivery, total and the main action. */
export function SummaryCard({ items, quote, loading, children }) {
  const toFree = quote ? Number(quote.freeShippingThreshold) - (Number(quote.subtotal) - Number(quote.discount)) : 0;
  return (
    <aside className="co-summary" aria-label="Order summary">
      <h2>Order Summary</h2>
      {items && (
        <ul className="co-summary-items">
          {items.map((i) => (
            <li key={i.key}>
              <SafeImg src={i.image} alt="" />
              <span>{i.name}<small> × {i.quantity}</small></span>
              <strong>{inr(i.lineTotal)}</strong>
            </li>
          ))}
        </ul>
      )}
      <div className="co-divider" />
      {!quote ? <div className="co-summary-loading" aria-busy="true">Calculating…</div> : (
        <>
        <dl className={`co-rows ${loading ? 'is-stale' : ''}`} aria-live="polite">
          <div className="co-row"><dt>Subtotal</dt><dd>{inr(quote.subtotal)}</dd></div>
          {Number(quote.discount) > 0 && (
            <div className="co-row co-row--discount"><dt>Discount ({quote.couponCode})</dt><dd>−{inr(quote.discount)}</dd></div>
          )}
          <div className="co-row"><dt>Delivery</dt><dd>{Number(quote.deliveryFee) === 0 ? 'Free' : inr(quote.deliveryFee)}</dd></div>
          <div className="co-row co-row--total"><dt>Total</dt><dd>{inr(quote.total)}</dd></div>
        </dl>
        {/* Outside the <dl>, which may only hold term/value pairs. */}
        {quote.deliveryType === 'STANDARD' && toFree > 0 && (
          <p className="co-free-hint">Add {inr(Math.ceil(toFree))} more for free standard delivery 🎁</p>
        )}
        </>
      )}
      {quote?.warnings?.map((w) => <p key={w} className="gg-alert gg-alert--warn">{w}</p>)}
      {children}
      <div className="co-safe"><div className="co-safe-icons" aria-hidden="true">💳🏦📱💰</div>Secure payments • 7-day returns</div>
    </aside>
  );
}
