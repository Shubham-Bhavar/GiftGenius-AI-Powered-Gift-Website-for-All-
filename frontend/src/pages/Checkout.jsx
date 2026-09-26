import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CouponBox, StepsBar, SummaryCard } from '../components/CheckoutParts.jsx';
import { ErrorNote, Field, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useCheckoutOptions, useCheckoutPrefs, useQuote } from '../hooks/useCheckout.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { usePayment } from '../hooks/usePayment.js';
import { api } from '../lib/api.js';
import { inr, newIdempotencyKey } from '../lib/format.js';

const STATES = ['Andhra Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

// Online methods all open Razorpay Checkout, which offers UPI, cards and net banking.
const PAY_METHODS = [
  { key: 'upi', label: '📱 UPI / QR Code', method: 'ONLINE' },
  { key: 'card', label: '💳 Credit / Debit Card', method: 'ONLINE' },
  { key: 'netbanking', label: '🏦 Net Banking', method: 'ONLINE' },
  { key: 'cod', label: '💰 Cash on Delivery', method: 'COD' },
];

function splitName(full = '') {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

export default function Checkout() {
  useDocumentTitle('Checkout');
  const { user } = useAuth();
  const cart = useCart();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pay = usePayment();
  const [prefs, setPrefs] = useCheckoutPrefs();
  const options = useCheckoutOptions();
  const quote = useQuote(cart.items, prefs.couponCode, prefs.deliveryType);
  const name = splitName(user.fullName);
  const [f, setF] = useState({
    firstName: name.first, lastName: name.last, email: user.email, phone: user.phone ?? '',
    addressLine: '', city: '', state: '', pincode: '',
  });
  const onlineEnabled = options.data?.onlinePaymentEnabled;
  const [payKey, setPayKey] = useState(onlineEnabled ? 'upi' : 'cod');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  // One key per checkout attempt: a double-click or network retry returns the same order.
  const idempotencyKey = useRef(newIdempotencyKey());

  if (cart.loading) return <Spinner label="Loading your cart…" />;
  if (cart.items.length === 0 && !busy) return <Navigate to="/cart" replace />;

  const payment = PAY_METHODS.find((m) => m.key === payKey) ?? PAY_METHODS[3];
  const effectiveMethod = payment.method === 'ONLINE' && !onlineEnabled ? 'COD' : payment.method;
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const err = (k) => fieldErrors[`shipping.${k}`];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const shipping = {
        fullName: `${f.firstName} ${f.lastName}`.trim(), email: f.email, phone: f.phone,
        addressLine: f.addressLine, city: f.city, state: f.state, pincode: f.pincode,
      };
      const order = await api.placeOrder(
        { shipping, deliveryType: prefs.deliveryType, paymentMethod: effectiveMethod, couponCode: prefs.couponCode || undefined },
        idempotencyKey.current,
      );
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['catalog'] });
      setPrefs({ couponCode: '' });
      if (order.payment) await pay(order);
      else await cart.refresh();
      navigate(`/account/orders/${order.orderNumber}?placed=1`, { replace: true });
    } catch (ex) {
      if (ex.status >= 400 && ex.status < 500) idempotencyKey.current = newIdempotencyKey();
      setFieldErrors(ex.errors || {});
      setError(ex);
      setBusy(false);
    }
  };

  const q = quote.data;
  return (
    <>
      <StepsBar current={2} />
      <form className="co-page" onSubmit={submit}>
        <div className="co-main">
          <h1 className="co-section-title">Delivery Details 📦</h1>
          <section className="co-form-section" aria-labelledby="ship-h">
            <h2 id="ship-h">📦 Shipping Address</h2>
            <div className="co-form-row">
              <Field label="First Name" required maxLength={60} autoComplete="given-name" value={f.firstName} onChange={set('firstName')} error={err('fullName')} />
              <Field label="Last Name" maxLength={60} autoComplete="family-name" value={f.lastName} onChange={set('lastName')} />
            </div>
            <div className="co-form-row">
              <Field label="Email" required type="email" autoComplete="email" value={f.email} onChange={set('email')} error={err('email')} />
              <Field label="Phone" required type="tel" pattern="[+0-9 \(\)\-]{10,20}" autoComplete="tel" placeholder="+91 98765 43210"
                value={f.phone} onChange={set('phone')} error={err('phone')} />
            </div>
            <div className="co-form-row full">
              <Field label="Address" required maxLength={300} autoComplete="street-address" placeholder="Flat / House No., Street, Landmark"
                value={f.addressLine} onChange={set('addressLine')} error={err('addressLine')} />
            </div>
            <div className="co-form-row co-form-row--3">
              <Field label="City" required maxLength={80} autoComplete="address-level2" placeholder="Mumbai" value={f.city} onChange={set('city')} error={err('city')} />
              <Field label="State" as="select" required value={f.state} onChange={set('state')} error={err('state')}>
                <option value="">Choose…</option>
                {STATES.map((s) => <option key={s}>{s}</option>)}
              </Field>
              <Field label="Pincode" required inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} autoComplete="postal-code" placeholder="400001"
                value={f.pincode} onChange={set('pincode')} error={err('pincode')} />
            </div>
            <div className="co-form-row full">
              <Field label="Delivery Option" as="select" value={prefs.deliveryType} onChange={(e) => setPrefs({ deliveryType: e.target.value })}>
                {(options.data?.delivery ?? []).map((d) => (
                  <option key={d.type} value={d.type}>{d.label} Delivery ({d.eta}) — {d.freeAbove ? `${inr(d.fee)}, free above ${inr(d.freeAbove)}` : inr(d.fee)}</option>
                ))}
              </Field>
            </div>
          </section>

          <section className="co-form-section" aria-labelledby="pay-h">
            <h2 id="pay-h">💳 Payment Method</h2>
            <div className="co-pay-methods" role="radiogroup" aria-labelledby="pay-h">
              {PAY_METHODS.map((m) => {
                const disabled = m.method === 'ONLINE' && !onlineEnabled;
                return (
                  <label key={m.key} className={`co-pay-method ${payKey === m.key ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}>
                    <input type="radio" name="pay" value={m.key} checked={payKey === m.key} disabled={disabled} onChange={() => setPayKey(m.key)} />
                    {m.label}
                  </label>
                );
              })}
            </div>
            <p className="co-muted">
              🔒 {onlineEnabled ? 'Online payments are processed securely by Razorpay.' : 'Online payment is unavailable right now — pay by cash or UPI on delivery.'}
            </p>
          </section>
          <CouponBox quote={q} couponCode={prefs.couponCode} onApply={(code) => setPrefs({ couponCode: code })} />
        </div>

        <SummaryCard items={cart.items} quote={q} loading={quote.isFetching}>
          <ErrorNote error={error} />
          <button className="co-btn-checkout" disabled={busy || !q || (q.warnings?.length ?? 0) > 0}>
            {busy ? 'Placing your order…' : effectiveMethod === 'ONLINE' ? `Pay ${q ? inr(q.total) : ''} →` : `Place Order · ${q ? inr(q.total) : ''} →`}
          </button>
          <Link to="/cart" className="co-continue">← Back to Cart</Link>
        </SummaryCard>
      </form>
    </>
  );
}
