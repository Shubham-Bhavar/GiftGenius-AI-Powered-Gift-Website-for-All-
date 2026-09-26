import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { useEffect } from 'react';
import AuthModal from './AuthModal.jsx';
import CartSidebar from './CartSidebar.jsx';
import GiftFinderModal from './GiftFinderModal.jsx';
import QuickView from './QuickView.jsx';
import { Announcement, Header } from './Header.jsx';
import { Footer } from './Footer.jsx';
import { Spinner } from './ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';

/** Every page shares the homepage chrome: announcement bar, header, footer, cart, modals and toast. */
export default function Layout() {
  const { ready } = useAuth();
  const { pathname, hash } = useLocation();
  const { closeCart, closeQuickView, closeGiftFinder } = useUi();

  // Close overlays on navigation (e.g. a product link inside the gift finder); honour #anchors (e.g. /help#returns).
  useEffect(() => {
    closeCart();
    closeQuickView();
    closeGiftFinder();
    if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [pathname, hash, closeCart, closeQuickView, closeGiftFinder]);

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Announcement />
      <Header />
      <main id="main-content" tabIndex={-1}>
        {ready ? <Outlet /> : <Spinner label="Restoring your session…" />}
      </main>
      <Footer />
      <CartSidebar />
      <QuickView />
      <GiftFinderModal />
      <AuthModal />
      <ScrollRestoration />
    </>
  );
}
