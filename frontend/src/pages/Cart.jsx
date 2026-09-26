import { Link, useNavigate } from 'react-router';
import SafeImg from '../components/SafeImg.jsx';
import { CouponBox, StepsBar, SummaryCard } from '../components/CheckoutParts.jsx';
import { EmptyState, ErrorNote, QuantityStepper, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { useCheckoutOptions, useCheckoutPrefs, useQuote } from '../hooks/useCheckout.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { inr } from '../lib/format.js';

export default function Cart() {
  useDocumentTitle('Your Cart');
  const cart = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { openAuth, openGiftFinder } = useUi();
  const [prefs, setPrefs] = useCheckoutPrefs();
  const quote = useQuote(cart.items, prefs.couponCode, prefs.deliveryType);
  const options = useCheckoutOptions();

  const run = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  if (cart.loading) return <Spinner label="Loading your cart…" />;

  const q = quote.data;
  const blocked = cart.items.some((i) => i.available === false) || (q?.warnings?.length ?? 0) > 0;
  const proceed = () => (user ? navigate('/checkout') : openAuth('login'));

  return (
    <>
      <StepsBar current={1} />
      {cart.items.length === 0 ? (
        <div className="gg-page">
          <EmptyState level={1} icon="🛒" title="Your cart is empty" action={<>
            <Link to="/shop" className="btn-primary">Explore Gifts →</Link>
            <button type="button" className="btn-outline" onClick={openGiftFinder}>✨ Find My Perfect Gift</button>
          </>}>
            Find something they&apos;ll love — every gift ships beautifully wrapped.
          </EmptyState>
        </div>
      ) : (
        <div className="co-page">
          <div className="co-main">
            <h1 className="co-section-title">Your Cart 🛒 <span>({cart.count} {cart.count === 1 ? 'item' : 'items'})</span></h1>
            <ul className="co-items">
              {cart.items.map((i) => (
                <li key={i.key} className={`co-item ${i.available === false ? 'co-item--out' : ''}`}>
                  <Link to={`/product/${i.productId}`} className="co-item-img"><SafeImg src={i.image} alt={i.name} /></Link>
                  <div className="co-item-info">
                    <Link to={`/product/${i.productId}`} className="co-item-name">{i.name}</Link>
                    <p className="co-item-price">{inr(i.unitPrice)} each</p>
                    {i.customName && <p className="co-item-note">✍️ Name: <strong>{i.customName}</strong></p>}
                    {i.customMessage && <p className="co-item-note">💌 “{i.customMessage}”</p>}
                    {i.available === false && <p className="co-item-warn">Not enough stock — reduce the quantity or remove it.</p>}
                    <div className="co-item-actions">
                      <QuantityStepper value={i.quantity} max={Math.min(10, i.stock ?? 10)} label={`Quantity of ${i.name}`}
                        onChange={run((n) => cart.update(i.key, n))} />
                      <button type="button" className="co-remove" onClick={run(() => cart.remove(i.key))}>✕ Remove</button>
                    </div>
                  </div>
                  <strong className="co-item-total">{inr(i.lineTotal)}</strong>
                </li>
              ))}
            </ul>
            <CouponBox quote={q} couponCode={prefs.couponCode} onApply={(code) => setPrefs({ couponCode: code })} />
            <ErrorNote error={quote.error} onRetry={() => quote.refetch()} />
          </div>

          <SummaryCard quote={q} loading={quote.isFetching}>
            <div className="co-field">
              <label htmlFor="delivery-type" className="co-label">Delivery Option</label>
              <select id="delivery-type" className="co-input" value={prefs.deliveryType} onChange={(e) => setPrefs({ deliveryType: e.target.value })}>
                {(options.data?.delivery ?? [{ type: 'STANDARD', label: 'Standard', eta: '3–5 days', fee: 49 }]).map((d) => (
                  <option key={d.type} value={d.type}>{d.label} ({d.eta}) — {d.freeAbove ? `${inr(d.fee)}, free above ${inr(d.freeAbove)}` : inr(d.fee)}</option>
                ))}
              </select>
            </div>
            <button type="button" className="co-btn-checkout" disabled={blocked || !q} onClick={proceed}>
              {user ? 'Proceed to Checkout →' : 'Sign in to Checkout →'}
            </button>
            {!user && <p className="co-muted">Your cart is saved and moves to your account when you sign in.</p>}
            <Link to="/shop" className="co-continue">← Continue Shopping</Link>
          </SummaryCard>
        </div>
      )}
    </>
  );
}
