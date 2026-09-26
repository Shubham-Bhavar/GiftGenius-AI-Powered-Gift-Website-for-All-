import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import SafeImg from './SafeImg.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { useRestoreFocus } from '../hooks/useRestoreFocus.js';
import { trapFocus } from '../lib/focus.js';

/** The homepage Quick View modal. */
export default function QuickView() {
  const { quickView: p, closeQuickView } = useUi();
  const cart = useCart();
  const toast = useToast();
  const closeBtn = useRef(null);
  const open = !!p;

  useRestoreFocus(open);
  useEffect(() => {
    if (!open) return undefined;
    closeBtn.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') closeQuickView(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeQuickView]);

  const add = async () => {
    try {
      await cart.add(p, 1);
      closeQuickView();
      toast('Added to cart! 🛒');
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const soldOut = p && (p.inStock === false || p.stock === 0);
  return (
    <>
      <div className={`modal-overlay ${open ? 'open' : ''}`} aria-hidden={!open} onClick={closeQuickView} />
      <div className={`quickview-modal ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Product quick view" aria-hidden={!open} inert={!open}
        onKeyDown={trapFocus}>
        <button type="button" className="modal-close" aria-label="Close quick view" ref={closeBtn} onClick={closeQuickView}>✕</button>
        {p && (
          <div className="modal-content">
            <div className="modal-img"><SafeImg src={p.image} alt={p.alt || p.name} loading="lazy" /></div>
            <div className="modal-info">
              <p className="modal-cat">{p.category}</p>
              <h3 className="modal-name">{p.name}</h3>
              <p className="modal-rating">★ {Number(p.rating).toFixed(1)} ({p.reviewCount} reviews)</p>
              <div className="modal-price">
                {Number(p.originalPrice) > Number(p.price) && <span className="price-og">₹{Number(p.originalPrice).toLocaleString('en-IN')}</span>}
                {' '}₹{Number(p.price).toLocaleString('en-IN')}
              </div>
              <p className="modal-desc">{p.description}</p>
              <button type="button" className="btn-primary" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}
                disabled={soldOut} onClick={add}>
                {soldOut ? 'Sold out' : 'Add to Cart →'}
              </button>
              <Link to={`/product/${p.id}`} className="link-arrow qv-details" onClick={closeQuickView}>View full details →</Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
