import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { storage } from '../lib/storage.js';
import { useAuth } from './AuthContext.jsx';

export const GUEST_WISHLIST_KEY = 'gg-wishlist';
const WishlistContext = createContext(null);

const snapshot = (p) => ({
  id: p.id, name: p.name, image: p.image, alt: p.alt, price: p.price, originalPrice: p.originalPrice,
  rating: p.rating, reviewCount: p.reviewCount, category: p.category, badge: p.badge, stock: p.stock,
  inStock: p.inStock,
});

export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [guest, setGuest] = useState(() => storage.getJson(GUEST_WISHLIST_KEY, []));

  useEffect(() => storage.setJson(GUEST_WISHLIST_KEY, guest), [guest]);
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === GUEST_WISHLIST_KEY) setGuest(storage.getJson(GUEST_WISHLIST_KEY, []));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const server = useQuery({ queryKey: ['wishlist'], queryFn: api.wishlist, enabled: !!user });

  const merging = useRef(false);
  useEffect(() => {
    if (!user || guest.length === 0 || merging.current) return;
    merging.current = true;
    api
      .mergeWishlist(guest.map((p) => p.id))
      .then((list) => {
        qc.setQueryData(['wishlist'], list);
        setGuest([]);
      })
      .catch(() => {})
      .finally(() => {
        merging.current = false;
      });
  }, [user, guest, qc]);

  const items = useMemo(() => (user ? server.data ?? [] : guest), [user, server.data, guest]);
  const ids = useMemo(() => new Set(items.map((p) => p.id)), [items]);

  const toggle = useCallback(
    async (product) => {
      const saved = ids.has(product.id);
      if (user) {
        const list = saved ? await api.removeFromWishlist(product.id) : await api.addToWishlist(product.id);
        qc.setQueryData(['wishlist'], list);
        return !saved;
      }
      setGuest((list) => (saved ? list.filter((p) => p.id !== product.id) : [snapshot(product), ...list]));
      return !saved;
    },
    [ids, user, qc],
  );

  const value = useMemo(
    () => ({ items, has: (id) => ids.has(id), toggle, count: items.length, loading: !!user && server.isLoading }),
    [items, ids, toggle, user, server.isLoading],
  );
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside WishlistProvider');
  return ctx;
}
