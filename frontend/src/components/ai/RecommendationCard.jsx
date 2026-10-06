import { useState } from 'react';
import { Link } from 'react-router';
import SafeImg from '../common/SafeImg.jsx';
import { staggerDelay } from '../../animations/motion.js';
import { useCart } from '../../context/CartContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { percentOff, rupees } from '../../lib/format.js';

/** What every AI pick card shares: its discount, and the "Add to cart" button's state and toast. */
function usePick(pick, addedMessage) {
  const cart = useCart();
  const toast = useToast();
  const [added, setAdded] = useState(false);
  const p = pick.product;
  const add = async () => {
    try {
      await cart.add(p, 1);
      setAdded(true);
      toast(addedMessage(p));
    } catch (err) {
      toast(err.message, 'bad');
    }
  };
  return { p, discount: percentOff(p.price, p.originalPrice), added, add };
}

/** The quiz page's design (pages/ai/GiftFinder). */
function PageCard({ pick, index }) {
  const { p, discount, added, add } = usePick(pick, (x) => `${x.name} added to cart 🛒`);
  return (
    <div className="result-pcard" style={{ animationDelay: staggerDelay(index) }}>
      <Link to={`/product/${p.id}`} className="rpc-img-wrap">
        <SafeImg src={p.image} alt={p.alt || p.name} className="rpc-img" loading="lazy" />
        {discount > 0 && <span className="rpc-discount">{discount}% OFF</span>}
      </Link>
      <div className="rpc-body">
        <div className="rpc-cat">{p.category}</div>
        <Link to={`/product/${p.id}`} className="rpc-name">{p.name}</Link>
        <p className="rpc-desc">{p.description}</p>
        <div className="rpc-reason">✨ {pick.reason}</div>
        <div className="rpc-foot">
          <div className="rpc-prices">
            {discount > 0 && <span className="rpc-og">{rupees(p.originalPrice)}</span>}
            <span className="rpc-now">{rupees(p.price)}</span>
          </div>
          <button type="button" className="rpc-add" disabled={added} onClick={add}>{added ? '✓ Added' : '+ Add to Cart'}</button>
        </div>
      </div>
    </div>
  );
}

/** The homepage Gift Finder modal's design (components/ai/GiftFinderModal). */
function ModalCard({ pick }) {
  const { p, discount, added, add } = usePick(pick, (x) => `${x.name} added to cart! 🛒`);
  return (
    <div className="gf-result-card">
      <div className="gf-result-img-wrap">
        <SafeImg src={p.image} alt={p.alt || p.name} loading="lazy" className="gf-result-img" />
        {discount > 0 && <span className="gf-result-badge">{discount}% off</span>}
      </div>
      <div className="gf-result-body">
        <p className="gf-result-cat">{p.category}</p>
        <h3 className="gf-result-name"><Link to={`/product/${p.id}`}>{p.name}</Link></h3>
        <p className="gf-result-desc">{p.description}</p>
        <div className="gf-result-reason">✨ {pick.reason}</div>
        <div className="gf-result-foot">
          <div className="gf-result-price">
            {discount > 0 && <span className="gf-result-og">{rupees(p.originalPrice)}</span>}
            <span className="gf-result-now">{rupees(p.price)}</span>
          </div>
          <button type="button" className="gf-result-add" disabled={added} onClick={add}>{added ? '✓ Added' : '+ Add'}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * One AI pick: a real catalogue product and the reason it suits them, with Add to Cart.
 * `variant` keeps each screen's original design: 'page' (the quiz page) or 'modal' (the homepage Gift Finder).
 */
export function RecommendationCard({ variant = 'page', ...props }) {
  return variant === 'modal' ? <ModalCard {...props} /> : <PageCard {...props} />;
}
