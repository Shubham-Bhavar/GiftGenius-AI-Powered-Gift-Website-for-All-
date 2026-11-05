import { useState } from 'react';
import { Link } from 'react-router';
import SafeImg from '../common/SafeImg.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { rupees } from '../../utils/format.js';
import { CARD_STYLES, REVEAL_ORDERS, THEMES, describeLook } from './look.js';
import { personalisable } from './StudioControls.jsx';

export const totalOf = (products) => products.reduce((sum, p) => sum + Number(p.price), 0);

/**
 * The buyer's view: what's in the box and what it costs against their budget, how it's presented, and the personal
 * touches. "Add to cart" carries what the shop can really do: the card message, and the printed name on gifts
 * that can be personalised. The look itself stays a preview.
 */
export function BuyerSummary({ config, products, look, photos, readOnly = false }) {
  const cart = useCart();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const total = totalOf(products);
  const budget = config.budget;
  const engraved = products.filter(personalisable);

  const addAll = async () => {
    setBusy(true);
    try {
      for (const [i, p] of products.entries()) {
        await cart.add(p, 1, {
          customName: personalisable(p) ? config.engraving : undefined,
          customMessage: i === 0 ? config.message : undefined, // one card for the whole gift
        });
      }
      toast(products.length === 1 ? `${products[0].name} added to cart 🛒` : `${products.length} gifts added to cart 🛒`);
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  // What the order is first (the gifts, the cost, the budget and the button); how it's presented after, more quietly.
  // The message itself is on the card beside this, so it isn't repeated here.
  return (
    <section className="buyer-summary" aria-labelledby="buyer-summary-h">
      <h2 id="buyer-summary-h" className="studio-h">What you’re giving</h2>
      <ul className="buyer-items">
        {products.map((p) => (
          <li key={p.id}>
            <SafeImg src={p.image} alt="" className="buyer-thumb" />
            <Link to={`/product/${p.id}`}>{p.name}</Link>
            <span>{rupees(p.price)}</span>
          </li>
        ))}
      </ul>
      <dl className="buyer-total">
        <div><dt>Total</dt><dd>{rupees(total)}</dd></div>
        {budget && (
          <div>
            <dt>Budget</dt>
            <dd className={total <= budget ? 'is-ok' : 'is-over'}>
              {total <= budget ? `Within your ${rupees(budget)} budget (${rupees(budget - total)} to spare)` : `${rupees(total - budget)} over your ${rupees(budget)} budget`}
            </dd>
          </div>
        )}
      </dl>
      {!readOnly && (
        <button type="button" className="btn-primary studio-add" disabled={busy || products.length === 0} onClick={addAll}>
          {busy ? 'Adding…' : products.length > 1 ? '🛒 Add all to cart' : '🛒 Add to cart'}
        </button>
      )}
      <p className="studio-note">
        Your card message{engraved.length > 0 ? ' and printed name go' : ' goes'} with the order. The colours, wrap and reveal are a preview only.
      </p>
      <h3 className="buyer-sub">How it’s presented</h3>
      <dl className="buyer-facts">
        <div><dt>Presentation</dt><dd>{THEMES[config.theme].label}: {describeLook(look)}</dd></div>
        <div><dt>Card</dt><dd>{CARD_STYLES[config.card]}{config.card === 'photo' ? ` with ${photos.length} photo${photos.length === 1 ? '' : 's'}` : ''}</dd></div>
        {engraved.length > 0 && <div><dt>Printed name</dt><dd>{config.engraving.trim() ? `“${config.engraving.trim()}” on the ${engraved[0].name}` : 'None'}</dd></div>}
        <div><dt>Reveal</dt><dd>{REVEAL_ORDERS[config.order]}</dd></div>
      </dl>
    </section>
  );
}
