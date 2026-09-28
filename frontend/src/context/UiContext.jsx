import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const UiContext = createContext(null);

/**
 * Site-wide overlays from the homepage design: cart sidebar, quick view, gift finder modal, the
 * sign-in modal and the first-visit welcome screen. Any page can open them; only one scroll lock applies at a time.
 */
export function UiProvider({ children }) {
  const [cartOpen, setCartOpen] = useState(false);
  const [quickView, setQuickView] = useState(null); // product
  const [giftFinderOpen, setGiftFinderOpen] = useState(false);
  const [authMode, setAuthMode] = useState(null); // 'login' | 'register' | 'forgot' | null
  const [authOptions, setAuthOptions] = useState(null); // { next?: path after sign-in, note?: why we're asking }
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  const anyOpen = cartOpen || !!quickView || giftFinderOpen || !!authMode || welcomeOpen;
  useEffect(() => {
    document.body.style.overflow = anyOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [anyOpen]);

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);
  const openQuickView = useCallback((p) => setQuickView(p), []);
  const closeQuickView = useCallback(() => setQuickView(null), []);
  const openGiftFinder = useCallback(() => setGiftFinderOpen(true), []);
  const closeGiftFinder = useCallback(() => setGiftFinderOpen(false), []);
  const openAuth = useCallback((mode = 'login', options = null) => {
    setAuthMode(mode);
    setAuthOptions(options);
  }, []);
  const closeAuth = useCallback(() => {
    setAuthMode(null);
    setAuthOptions(null);
  }, []);
  const openWelcome = useCallback(() => setWelcomeOpen(true), []);
  const closeWelcome = useCallback(() => setWelcomeOpen(false), []);

  const value = useMemo(() => ({
    cartOpen, openCart, closeCart,
    quickView, openQuickView, closeQuickView,
    giftFinderOpen, openGiftFinder, closeGiftFinder,
    authMode, authOptions, openAuth, closeAuth,
    welcomeOpen, openWelcome, closeWelcome,
  }), [cartOpen, openCart, closeCart, quickView, openQuickView, closeQuickView, giftFinderOpen, openGiftFinder,
    closeGiftFinder, authMode, authOptions, openAuth, closeAuth, welcomeOpen, openWelcome, closeWelcome]);

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside UiProvider');
  return ctx;
}
