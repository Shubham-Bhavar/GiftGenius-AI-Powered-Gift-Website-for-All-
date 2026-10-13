import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useCart } from '../../context/CartContext.jsx';
import { useUi } from '../../context/UiContext.jsx';
import { useWishlist } from '../../context/WishlistContext.jsx';
import { useTheme } from '../../hooks/useTheme.js';
import { AccountMenu } from './AccountMenu.jsx';
import { MobileNav, NavPill } from './Navigation.jsx';
import { SearchBox } from './SearchBox.jsx';

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
          <AccountMenu />
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
      <MobileNav open={menuOpen} ref={menuRef} />
    </>
  );
}
