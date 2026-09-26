import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { NAV_LINKS } from '../config/site.js';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useSearch } from '../context/SearchContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { useTheme } from '../hooks/useTheme.js';

const STATIC_SUGGESTIONS = [
  'Perfume', 'Watch', 'Gift Box', 'Rose Bouquet', 'Hamper', 'Engraved Gift', 'Luxury Set', 'Birthday Gift',
  'Anniversary Gift', 'Festival Hamper', 'Personalized Gift', 'Chocolate Box',
];

function isActive(link, pathname) {
  return link.end ? pathname === link.to : pathname === link.to || pathname.startsWith(`${link.to}/`);
}

export function Announcement() {
  return (
    <div className="announcement" role="region" aria-label="Promotions">
      <span>🎁 Free shipping on orders above ₹999</span>
      <span className="ann-divider" aria-hidden="true" />
      <span>Use code <strong className="ann-highlight">GIFT20</strong> for 20% off</span>
      <span className="ann-divider" aria-hidden="true" />
      <span>Same-day delivery in Mumbai</span>
    </div>
  );
}

/** Animated gold pill that slides under the active link (homepage NavPill). */
function NavPill() {
  const { pathname } = useLocation();
  const pill = useRef(null);
  const active = NAV_LINKS.find((l) => isActive(l, pathname));

  useLayoutEffect(() => {
    const el = pill.current;
    if (!el) return undefined;
    const move = () => {
      const a = el.querySelector('a.active');
      if (!a) {
        el.style.setProperty('--pill-width', '0px');
        return;
      }
      const pr = el.getBoundingClientRect();
      const er = a.getBoundingClientRect();
      el.style.setProperty('--pill-left', `${er.left - pr.left}px`);
      el.style.setProperty('--pill-width', `${er.width}px`);
    };
    const raf = requestAnimationFrame(move);
    window.addEventListener('resize', move);
    document.fonts?.ready?.then(move);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', move); };
  }, [pathname]);

  return (
    <div className="nav-wrap">
      <nav className="nav-pill" id="navPill" aria-label="Main navigation" ref={pill}>
        {NAV_LINKS.map((l) => (
          <Link key={l.to} to={l.to} className={active === l ? 'active' : undefined} aria-current={active === l ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Header search with the homepage's live suggestion dropdown. */
function SearchBox() {
  const { query, setQuery } = useSearch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => api.products({ size: 100 }), staleTime: 5 * 60_000 });

  const suggestions = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const names = (catalog.data?.content ?? []).map((p) => p.name);
    return [...new Set([...names, ...STATIC_SUGGESTIONS])].filter((s) => s.toLowerCase().includes(q)).slice(0, 6);
  }, [query, catalog.data]);

  const choose = (text) => {
    setQuery(text);
    setOpen(false);
    if (pathname === '/') document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
    else navigate(`/shop?q=${encodeURIComponent(text)}`);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setQuery(''); setOpen(false); return; }
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(highlighted >= 0 ? suggestions[highlighted] : query.trim());
    }
  };

  return (
    <div className="search-wrap" role="search">
      <label htmlFor="searchInput" className="sr-only">Search gifts</label>
      <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
      <input type="search" id="searchInput" placeholder="Search gifts…" autoComplete="off" role="combobox"
        aria-autocomplete="list" aria-controls="searchSuggestions" aria-expanded={open && suggestions.length > 0}
        aria-activedescendant={open && highlighted >= 0 ? `searchOpt${highlighted}` : undefined}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlighted(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown} />
      <div className={`search-suggestions ${open && suggestions.length ? 'open' : ''}`} id="searchSuggestions" role="listbox" aria-label="Search suggestions">
        {open && suggestions.map((s, i) => (
          <div key={s} id={`searchOpt${i}`} className={`search-suggestion-item ${i === highlighted ? 'highlighted' : ''}`} role="option"
            aria-selected={i === highlighted} onMouseDown={(e) => { e.preventDefault(); choose(s); }}>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountButton() {
  const { user, isAdmin, logout } = useAuth();
  const { openAuth } = useUi();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!user) {
    return <button type="button" className="icon-btn" title="Account" aria-label="Sign in to your account" onClick={() => openAuth('login')}>👤</button>;
  }
  const go = (to) => { setOpen(false); navigate(to); };
  return (
    <div className="account-menu" ref={ref}>
      <button type="button" className="icon-btn icon-btn--signed" title={user.fullName} aria-haspopup="menu" aria-expanded={open}
        aria-label={`Account menu for ${user.fullName}`} onClick={() => setOpen((o) => !o)}>
        👤
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          <p className="account-who">{user.fullName}<small>{user.email}</small></p>
          <button role="menuitem" type="button" onClick={() => go('/account/orders')}>📦 My Orders</button>
          <button role="menuitem" type="button" onClick={() => go('/wishlist')}>❤️ Wishlist</button>
          <button role="menuitem" type="button" onClick={() => go('/account')}>⚙️ Account Settings</button>
          {isAdmin && <button role="menuitem" type="button" onClick={() => go('/admin')}>🛡️ Store Admin</button>}
          <button role="menuitem" type="button" className="account-signout" onClick={async () => {
            setOpen(false);
            navigate('/', { replace: true });
            await logout();
            toast("You're signed out. See you soon! 👋");
          }}>↩ Sign Out</button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const cart = useCart();
  const wishlist = useWishlist();
  const { openCart } = useUi();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e) => {
      if (!menuRef.current?.contains(e.target) && !toggleRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') { setMenuOpen(false); toggleRef.current?.focus(); } };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const active = NAV_LINKS.find((l) => isActive(l, pathname));
  return (
    <>
      <header className="site-header" role="banner">
        <Link className="logo" to="/" aria-label="GiftGenius — Home">
          <span className="logo-mark" aria-hidden="true">🎁</span>
          Gift<em>Genius</em>
        </Link>
        <NavPill />
        <div className="header-right">
          <SearchBox />
          <button type="button" className="icon-btn" id="themeToggle" title="Toggle dark mode" aria-pressed={dark}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggle}>
            <span className="theme-icon">{dark ? '☀️' : '🌙'}</span>
          </button>
          <button type="button" className="wishlist-nav-btn" title="My Wishlist" aria-label={`My wishlist, ${wishlist.count} items`}
            onClick={() => navigate('/wishlist')}>
            <span className="wl-icon">{wishlist.count > 0 ? '❤️' : '🤍'}</span>
            <span className={`wishlist-nav-badge ${wishlist.count > 0 ? 'visible' : ''}`}>{wishlist.count}</span>
          </button>
          <AccountButton />
          <button type="button" className="icon-btn" id="cartToggle" title="Open cart"
            aria-label={`Open cart, ${cart.count} item${cart.count !== 1 ? 's' : ''}`} onClick={openCart}>
            🛒
            <span className="cart-badge" data-testid="cart-count" aria-live="polite" aria-atomic="true">{cart.count}</span>
          </button>
          <button type="button" className="hamburger" id="menuToggle" ref={toggleRef} aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen} aria-controls="mobileMenu" onClick={() => setMenuOpen((o) => !o)}>
            <span /><span /><span />
          </button>
        </div>
      </header>
      <nav className="mobile-menu" id="mobileMenu" aria-label="Mobile navigation" hidden={!menuOpen} ref={menuRef}>
        {NAV_LINKS.map((l) => (
          <Link key={l.to} to={l.to} aria-current={active === l ? 'page' : undefined}>{l.label}</Link>
        ))}
        <Link to="/track">Track Order</Link>
      </nav>
    </>
  );
}
