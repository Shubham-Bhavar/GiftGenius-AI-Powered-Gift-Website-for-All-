import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import SafeImg from './SafeImg.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useUi } from '../context/UiContext.jsx';

const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

/** The homepage product card (markup, classes and micro-interactions from the original design). */
export default function ProductCard({ product: p, reason }) {
  const navigate = useNavigate();
  const cart = useCart();
  const wishlist = useWishlist();
  const toast = useToast();
  const { openQuickView } = useUi();
  const [addState, setAddState] = useState('idle'); // idle | loading | added
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const wished = wishlist.has(p.id);
  const soldOut = p.inStock === false || p.stock === 0;
  const badge = p.badge;

  const add = async (e) => {
    e.stopPropagation();
    setAddState('loading');
    try {
      await cart.add(p, 1);
      toast(`${p.name} added to cart`);
      setAddState('added');
      timer.current = setTimeout(() => setAddState('idle'), 1800);
    } catch (err) {
      toast(err.message, 'bad');
      setAddState('idle');
    }
  };

  const toggleWish = async (e) => {
    e.stopPropagation();
    try {
      const now = await wishlist.toggle(p);
      toast(now ? `${p.name} added to wishlist ❤️` : `${p.name} removed from wishlist`);
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const open = () => navigate(`/product/${p.id}`);

  return (
    // The whole card opens the product for mouse and touch; the name is the real link for keyboards and screen readers.
    <div className="pcard" role="listitem" data-id={p.id} data-price={p.price} data-rating={p.rating} onClick={open}>
      <div className="pcard-img">
        {badge && <span className={`pbadge ${badge.className || ''}`}>{badge.text}</span>}
        <button type="button" className={`wish-btn ${wished ? 'active' : ''}`} aria-pressed={wished}
          aria-label={`${wished ? 'Remove' : 'Add'} ${p.name} ${wished ? 'from' : 'to'} wishlist`} onClick={toggleWish}>
          {wished ? '❤️' : '🤍'}
        </button>
        <SafeImg src={p.image} alt={p.alt || p.name} loading="lazy" />
        <button type="button" className="quickview-btn" aria-label={`Quick view ${p.name}`}
          onClick={(e) => { e.stopPropagation(); openQuickView(p); }}>
          Quick View
        </button>
      </div>
      <div className="pcard-body">
        <p className="pcard-cat">{p.category}</p>
        <h3 className="pcard-name"><Link to={`/product/${p.id}`} onClick={(e) => e.stopPropagation()}>{p.name}</Link></h3>
        {reason && <p className="pcard-reason">✨ {reason}</p>}
        <div className="pcard-rating" role="img" aria-label={`Rated ${Number(p.rating).toFixed(1)} out of 5 from ${p.reviewCount} reviews`}>
          <span className="stars" aria-hidden="true">{p.starsDisplay}</span>
          <span>{Number(p.rating).toFixed(1)} ({p.reviewCount})</span>
        </div>
        <div className="pcard-foot">
          <div className="pcard-price">
            {Number(p.originalPrice) > Number(p.price) && (
              <span className="price-og"><span className="sr-only">Original price:</span>{rupees(p.originalPrice)}</span>
            )}
            <span className="price-now"><span className="sr-only">Sale price:</span>{rupees(p.price)}</span>
          </div>
          <button
            type="button"
            className="add-btn"
            aria-label={soldOut ? `${p.name} is sold out` : `Add ${p.name} to cart`}
            disabled={soldOut || addState === 'loading'}
            style={addState === 'added' ? { background: 'var(--gold)', color: 'var(--ink)' } : undefined}
            onClick={add}
          >
            {soldOut ? 'Sold out' : addState === 'loading' ? '…' : addState === 'added' ? '✓ Added' : '+ Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Product grid with the homepage's arrow-key navigation between cards. */
export function ProductGrid({ products, reasons, id, label = 'Products' }) {
  const onKeyDown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const grid = e.currentTarget;
    const cards = [...grid.querySelectorAll('.pcard')];
    const active = document.activeElement?.closest('.pcard');
    if (!active) return;
    const idx = cards.indexOf(active);
    const cols = Math.max(1, Math.round(grid.offsetWidth / (active.offsetWidth || 1)));
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
    const next = cards[idx + delta];
    if (next) {
      e.preventDefault();
      next.querySelector('button')?.focus();
    }
  };
  return (
    <div className="product-grid" id={id} role="list" aria-label={label} onKeyDown={onKeyDown}>
      {products.map((p) => <ProductCard key={p.id} product={p} reason={reasons?.[p.id]} />)}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }) {
  return (
    <div className="product-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="pcard pcard--skeleton">
          <div className="pcard-img" />
          <div className="pcard-body"><p className="pcard-cat" /><h3 className="pcard-name" /></div>
        </div>
      ))}
    </div>
  );
}
