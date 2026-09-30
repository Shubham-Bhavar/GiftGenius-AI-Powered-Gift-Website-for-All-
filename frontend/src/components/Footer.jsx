import { useState } from 'react';
import { Link } from 'react-router';
import { SITE } from '../config/site.js';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** Homepage newsletter block, subscribed through the API. */
export function Newsletter() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const val = email.trim();
    if (!isValidEmail(val)) {
      toast('Please enter a valid email address.', 'bad');
      document.getElementById('nlEmail')?.focus();
      return;
    }
    setBusy(true);
    try {
      await api.subscribe(val);
      toast('Subscribed! 🎉 Check your inbox.');
      setEmail('');
    } catch (err) {
      toast(err.errors?.email || err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="newsletter" aria-labelledby="newsletter-heading">
      <h2 id="newsletter-heading">Get Gift Inspiration</h2>
      <p>Subscribe for new arrivals, exclusive deals, and curated gifting ideas sent to your inbox.</p>
      <div className="nl-form" role="form" aria-label="Newsletter signup">
        <label htmlFor="nlEmail" className="sr-only">Your email address</label>
        <input type="email" id="nlEmail" placeholder="Enter your email address" autoComplete="email" aria-required="true"
          value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <button className="btn-primary" id="nlSubmit" type="button" disabled={busy} onClick={submit}>
          {busy ? 'Subscribing…' : 'Subscribe →'}
        </button>
      </div>
    </section>
  );
}

const SOCIAL = [
  ['facebook', 'Facebook', '📘'], ['instagram', 'Instagram', '📸'], ['twitter', 'Twitter', '🐦'], ['youtube', 'YouTube', '▶️'],
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <Link className="logo footer-logo" to="/" aria-label="GiftGenius — Home">
            <span className="logo-mark" aria-hidden="true">🎁</span>
            Gift<em>Genius</em>
          </Link>
          <p>Thoughtful gifts for every occasion. We help you express love, gratitude, and celebration through perfectly curated presents.</p>
          <div className="footer-socials" role="group" aria-label="Social media links">
            {SOCIAL.filter(([k]) => SITE.social[k]).map(([k, label, icon]) => (
              <a key={k} href={SITE.social[k]} className="soc-btn" aria-label={label} target="_blank" rel="noopener noreferrer">{icon}</a>
            ))}
          </div>
        </div>
        <nav className="footer-col" aria-label="Shop">
          <h2>Shop</h2>
          <ul>
            <li><Link to="/shop?occasion=birthday">Birthday Gifts</Link></li>
            <li><Link to="/shop?occasion=anniversary">Anniversary</Link></li>
            <li><Link to="/shop?occasion=valentine">Valentine&apos;s Day</Link></li>
            <li><Link to="/shop?occasion=festival">Festival Gifts</Link></li>
            <li><Link to="/shop?sort=newest">New Arrivals</Link></li>
          </ul>
        </nav>
        <nav className="footer-col" aria-label="Help">
          <h2>Help</h2>
          <ul>
            <li><Link to="/track">Track Order</Link></li>
            <li><Link to="/help#returns">Returns &amp; Exchange</Link></li>
            <li><Link to="/help#gift-wrapping">Gift Wrapping</Link></li>
            <li><Link to="/contact?topic=bulk">Bulk Orders</Link></li>
            <li><Link to="/contact">Contact Us</Link></li>
          </ul>
        </nav>
        <nav className="footer-col" aria-label="Company">
          <h2>Company</h2>
          <ul>
            <li><Link to="/about">About Us</Link></li>
            <li><Link to="/sell">Sell on GiftGenius</Link></li>
            <li><Link to="/collections">Collections</Link></li>
            <li><Link to="/gift-finder">Gift Guide</Link></li>
            <li><Link to="/privacy">Privacy Policy</Link></li>
            <li><Link to="/terms">Terms of Service</Link></li>
          </ul>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} GiftGenius. All rights reserved.</span>
        <div className="pay-icons" role="img" aria-label="Payment methods: cards, net banking, UPI, cash on delivery">
          <span>💳</span><span>🏦</span><span>📱</span><span>💰</span>
        </div>
      </div>
    </footer>
  );
}
