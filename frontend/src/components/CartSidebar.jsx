import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import SafeImg from './SafeImg.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { useRestoreFocus } from '../hooks/useRestoreFocus.js';
import { trapFocus } from '../lib/focus.js';

const FREE_SHIPPING_THRESHOLD = 999;
const rupees = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;

/** The homepage's sliding cart panel, backed by the real (guest or account) cart. */
export default function CartSidebar() {
  const { cartOpen, closeCart } = useUi();
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const closeBtn = useRef(null);

  useRestoreFocus(cartOpen);
  useEffect(() => {
    if (cartOpen) closeBtn.current?.focus();
  }, [cartOpen]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') closeCart();
    else trapFocus(e);
  };

  const run = (fn) => async () => {
    try {
      await fn();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const total = cart.subtotal;
  const remaining = FREE_SHIPPING_THRESHOLD - total;
  const pct = Math.min((total / FREE_SHIPPING_THRESHOLD) * 100, 100);
  const lines = cart.items.length;

  return (
    <>
      <div className={`cart-overlay ${cartOpen ? 'open' : ''}`} aria-hidden={!cartOpen} onClick={closeCart} />
      <div className="cart-side" id="cartSide" aria-label="Shopping cart" aria-modal="true" role="dialog"
        hidden={!cartOpen} inert={!cartOpen} onKeyDown={onKeyDown}>
        <div className="cart-progress" aria-hidden="true">
          <div className="cart-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="cart-hd">
          <h2>Your Cart <span className="cart-item-count">{lines ? `(${lines} item${lines > 1 ? 's' : ''})` : ''}</span></h2>
          <button type="button" className="cart-close-btn" aria-label="Close cart" ref={closeBtn} onClick={closeCart}>✕</button>
        </div>
        <div className="cart-body" aria-live="polite" aria-relevant="additions removals">
          {lines === 0 ? (
            <div className="cart-empty">
              <div className="ei" aria-hidden="true">🛒</div>
              <p>Your cart is empty.<br />Find the perfect gift above!</p>
            </div>
          ) : (
            <>
              <div className={remaining > 0 ? 'cart-msg cart-msg--ship' : 'cart-msg cart-msg--free'}>
                {remaining > 0 ? <>Add <strong>{rupees(remaining)}</strong> more for free shipping 🎁</> : "🎉 You've unlocked free shipping!"}
              </div>
              {cart.items.map((i) => (
                <div className="cart-item" key={i.key}>
                  <SafeImg className="ci-img" src={i.image} alt={i.name} loading="lazy" />
                  <div className="ci-info">
                    <p className="ci-name">{i.name}</p>
                    <p className="ci-price">{rupees(i.unitPrice)}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</p>
                    {i.customMessage && <p className="ci-note">“{i.customMessage}”</p>}
                    <div className="ci-qty" role="group" aria-label={`Quantity of ${i.name}`}>
                      <button type="button" aria-label="Decrease quantity" disabled={i.quantity <= 1}
                        onClick={run(() => cart.update(i.key, i.quantity - 1))}>−</button>
                      <span>{i.quantity}</span>
                      <button type="button" aria-label="Increase quantity" disabled={i.quantity >= Math.min(10, i.stock ?? 10)}
                        onClick={run(() => cart.update(i.key, i.quantity + 1))}>+</button>
                    </div>
                  </div>
                  <button type="button" className="ci-del" aria-label={`Remove ${i.name} from cart`} onClick={run(() => cart.remove(i.key))}>✕</button>
                </div>
              ))}
            </>
          )}
        </div>
        {lines > 0 && (
          <div className="cart-ft">
            <div className="cart-total-row">
              <span>Total</span>
              <span className="cart-total-val">{rupees(total)}</span>
            </div>
            <button type="button" className="checkout-btn" onClick={() => { closeCart(); navigate('/cart'); }}>
              Proceed to Checkout →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
