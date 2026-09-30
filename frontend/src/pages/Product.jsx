import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import SafeImg from '../components/SafeImg.jsx';
import { ProductGrid } from '../components/ProductCard.jsx';
import { Breadcrumbs, EmptyState, ErrorNote, QuantityStepper, Spinner } from '../components/ui.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useReveal } from '../hooks/useReveal.js';
import { api } from '../lib/api.js';
import { percentOff, titleCase } from '../lib/format.js';

const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const TABS = [['description', 'Description'], ['details', 'Gift Details'], ['delivery', 'Delivery & Returns']];

function MessageHelper({ product, onPick }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ recipient: '', occasion: '', tone: 'warm', senderName: '' });
  const [state, setState] = useState({ busy: false, messages: null, source: null, error: null });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!open) {
    return <button type="button" className="pd-ai-link" onClick={() => setOpen(true)}>✨ Help me write the message with GiftGenius AI</button>;
  }
  const generate = async () => {
    setState({ busy: true, messages: null, source: null, error: null });
    try {
      const res = await api.giftMessages({ ...form, productName: product.name });
      setState({ busy: false, messages: res.messages, source: res.source, error: null });
    } catch (err) {
      setState({ busy: false, messages: null, source: null, error: err });
    }
  };
  return (
    <div className="pd-ai-box">
      <div className="pd-ai-grid">
        <label>For
          <select className="pd-input" value={form.recipient} onChange={set('recipient')}>
            <option value="">Someone special</option>
            {['partner', 'mother', 'father', 'friend', 'sibling', 'colleague'].map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
          </select>
        </label>
        <label>Occasion
          <select className="pd-input" value={form.occasion} onChange={set('occasion')}>
            <option value="">Just because</option>
            {(product.occasion?.length ? product.occasion : ['birthday', 'anniversary']).map((o) => <option key={o} value={o}>{titleCase(o)}</option>)}
          </select>
        </label>
        <label>Tone
          <select className="pd-input" value={form.tone} onChange={set('tone')}>
            {['warm', 'funny', 'romantic', 'formal', 'poetic'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </select>
        </label>
        <label>Signed by
          <input className="pd-input" maxLength={60} placeholder="Optional" value={form.senderName} onChange={set('senderName')} />
        </label>
      </div>
      <button type="button" className="btn-outline btn-sm" disabled={state.busy} onClick={generate}>
        {state.busy ? 'Writing…' : '✨ Suggest messages'}
      </button>
      <ErrorNote error={state.error} />
      {state.messages && (
        <ul className="pd-ai-list">
          {state.messages.map((m) => <li key={m}><button type="button" onClick={() => onPick(m)}>{m}</button></li>)}
          <li className="pd-ai-note">{state.source === 'ai' ? 'Written by GiftGenius AI. ' : ''}Tap one to use it — you can edit it after.</li>
        </ul>
      )}
    </div>
  );
}

export default function Product() {
  const { id } = useParams();
  const cart = useCart();
  const wishlist = useWishlist();
  const toast = useToast();
  const { openCart } = useUi();
  const [qty, setQty] = useState(1);
  const [customName, setCustomName] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState('description');

  const product = useQuery({ queryKey: ['product', id], queryFn: () => api.product(id) });
  const related = useQuery({ queryKey: ['related', id], queryFn: () => api.related(id, 4), enabled: product.isSuccess });
  useDocumentTitle(product.data?.name);
  useReveal([related.data]);

  if (product.isPending) return <Spinner label="Loading gift…" />;
  if (product.error) {
    return (
      <div className="gg-page">
        {product.error.status === 404 ? (
          <EmptyState level={1} icon="🎁" title="We couldn't find that gift" action={<Link to="/shop" className="btn-primary">Browse all gifts →</Link>}>
            It may have sold out for good or been renamed.
          </EmptyState>
        ) : <ErrorNote error={product.error} onRetry={() => product.refetch()} />}
      </div>
    );
  }

  const p = product.data;
  const off = percentOff(p.price, p.originalPrice);
  const saved = wishlist.has(p.id);
  const soldOut = !p.inStock;
  const personalisable = p.category === 'personalized' || p.tags?.includes('personalized');

  // Tabs pattern: arrow keys move between tabs, Home/End jump to the first/last.
  const onTabKey = (e) => {
    const keys = TABS.map(([k]) => k);
    const i = keys.indexOf(tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: keys.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const k = keys[(next + keys.length) % keys.length];
    setTab(k);
    document.getElementById(`tab-${k}`)?.focus();
  };

  const addToCart = async () => {
    setAdding(true);
    try {
      await cart.add(p, qty, { customName, customMessage });
      toast(`${p.name} added to cart 🛒`);
      openCart();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: titleCase(p.category), to: `/shop?category=${encodeURIComponent(p.category)}` }, { label: p.name }]} />

      <div className="pd-wrap">
        <div className="pd-image-col">
          <div className="pd-main-image">
            <SafeImg src={p.image} alt={p.alt || p.name} />
            {off > 0 && <div className="pd-badge-sale">{off}% OFF</div>}
            {p.badge && <span className={`pbadge ${p.badge.className || ''}`}>{p.badge.text}</span>}
          </div>
        </div>

        <div className="pd-info">
          <div className="pd-category">{p.category}</div>
          <h1 className="pd-title">{p.name}</h1>
          {p.seller && (
            <p className="pd-seller">
              Sold by <strong>{p.seller.storeName}</strong>
              <Link to={`/store/${encodeURIComponent(p.seller.slug)}`} className="pd-seller-link">Visit store →</Link>
            </p>
          )}
          <div className="pd-rating">
            {p.reviewCount > 0 ? (
              <>
                <span className="stars" aria-hidden="true">{p.starsDisplay}</span>
                <strong>{Number(p.rating).toFixed(1)}</strong>
                <span className="pd-rating-count">({p.reviewCount} reviews)</span>
              </>
            ) : <span className="pd-rating-count">New · no reviews yet</span>}
            <span className={`pd-stock ${soldOut ? 'pd-stock--out' : p.stock < 10 ? 'pd-stock--low' : ''}`}>
              {soldOut ? '✕ Sold out' : p.stock < 10 ? `Only ${p.stock} left` : '✓ In Stock'}
            </span>
          </div>
          <div className="pd-price-row">
            <span className="pd-price-current">{rupees(p.price)}</span>
            {off > 0 && <><span className="pd-price-original">{rupees(p.originalPrice)}</span>
              <span className="pd-price-off">Save {rupees(p.originalPrice - p.price)}</span></>}
          </div>
          <p className="pd-desc">{p.description}</p>
          <div className="pd-divider" />

          {!soldOut && (
            <>
              <div className="pd-label">Personalise Your Gift <span>(free)</span></div>
              {personalisable && (
                <>
                  <label htmlFor="pd-name" className="sr-only">Name to print or engrave</label>
                  <input id="pd-name" className="pd-input" maxLength={80} placeholder="Add a custom name (e.g. 'Happy Birthday Priya 🎂')"
                    value={customName} onChange={(e) => setCustomName(e.target.value)} />
                </>
              )}
              <label htmlFor="pd-msg" className="sr-only">Gift card message</label>
              <textarea id="pd-msg" className="pd-input" rows={3} maxLength={300} placeholder="Add a heartfelt message for the gift card (optional)"
                value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} />
              <div className="pd-counter">{customMessage.length}/300</div>
              <MessageHelper product={p} onPick={setCustomMessage} />

              <div className="pd-label">Quantity</div>
              <div className="pd-qty">
                <QuantityStepper value={qty} max={Math.min(10, p.stock)} onChange={setQty} />
                <span className="pd-hint">Max {Math.min(10, p.stock)} per order</span>
              </div>
            </>
          )}

          <button type="button" className="pd-btn-cart" disabled={soldOut || adding} onClick={addToCart}>
            {soldOut ? 'Sold out' : adding ? 'Adding…' : '🛒 Add to Cart'}
          </button>
          <button type="button" className={`pd-btn-wishlist ${saved ? 'is-saved' : ''}`} aria-pressed={saved} onClick={async () => {
            try {
              toast((await wishlist.toggle(p)) ? `${p.name} added to wishlist ❤️` : `${p.name} removed from wishlist`);
            } catch (err) {
              toast(err.message, 'bad');
            }
          }}>
            {saved ? '❤️ Saved to Wishlist' : '♡ Save to Wishlist'}
          </button>

          <div className="pd-trust">
            <div><span>🚀</span><p>Same-Day Delivery</p></div>
            <div><span>🎀</span><p>Free Wrapping</p></div>
            <div><span>🔄</span><p>7-Day Returns</p></div>
            <div><span>✅</span><p>100% Authentic</p></div>
          </div>
        </div>
      </div>

      <div className="pd-tabs">
        <div className="pd-tab-btns" role="tablist" aria-label="Product information" onKeyDown={onTabKey}>
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`}
              tabIndex={tab === k ? 0 : -1} className={`pd-tab-btn ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <div className="pd-tab-content" role="tabpanel" id="panel-description" aria-labelledby="tab-description" hidden={tab !== 'description'}>
          <p>{p.longDescription || p.description}</p>
          <p>Every gift is hand-checked, wrapped in our signature paper with a satin ribbon, and sent with a personalised card carrying your message.</p>
        </div>
        <div className="pd-tab-content" role="tabpanel" id="panel-details" aria-labelledby="tab-details" hidden={tab !== 'details'}>
          <ul className="pd-detail-list">
            <li><strong>Category</strong><span>{titleCase(p.category)}</span></li>
            {p.occasion?.length > 0 && <li><strong>Perfect for</strong><span>{p.occasion.map(titleCase).join(', ')}</span></li>}
            {p.relationship?.length > 0 && <li><strong>Great gift for</strong><span>{p.relationship.map(titleCase).join(', ')}</span></li>}
            {p.personality?.length > 0 && <li><strong>Suits</strong><span>{p.personality.map(titleCase).join(', ')} personalities</span></li>}
            {p.tags?.length > 0 && (
              <li><strong>Tags</strong><span className="pd-tags">{p.tags.map((t) => <Link key={t} to={`/shop?tag=${encodeURIComponent(t)}`} className="pill">{t}</Link>)}</span></li>
            )}
          </ul>
        </div>
        <div className="pd-tab-content" role="tabpanel" id="panel-delivery" aria-labelledby="tab-delivery" hidden={tab !== 'delivery'}>
          <ul className="pd-detail-list">
            <li><strong>Standard</strong><span>3–5 days · ₹49, free on orders above ₹999</span></li>
            <li><strong>Express</strong><span>1–2 days · ₹99</span></li>
            <li><strong>Same day</strong><span>Order before 2 PM · ₹149</span></li>
            <li><strong>Cancellations</strong><span>Free until your gift ships, from My Orders</span></li>
            <li><strong>Returns</strong><span>7-day hassle-free returns on unused items. <Link to="/help#returns">Read the policy →</Link></span></li>
          </ul>
        </div>
      </div>

      {related.data?.length > 0 && (
        <section className="products-section pd-related" aria-labelledby="related-heading">
          <div className="sec-topbar">
            <h2 id="related-heading">You Might Also Love 💫</h2>
            <Link to={`/shop?category=${encodeURIComponent(p.category)}`} className="link-arrow">View all →</Link>
          </div>
          <ProductGrid products={related.data} label="Related gifts" />
        </section>
      )}
    </>
  );
}
