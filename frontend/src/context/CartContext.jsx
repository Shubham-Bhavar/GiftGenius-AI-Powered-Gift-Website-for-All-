import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { storage } from '../lib/storage.js';
import { useAuth } from './AuthContext.jsx';

export const GUEST_CART_KEY = 'gg-cart';
export const MAX_QTY = 10;

const CartContext = createContext(null);

const clean = (s) => (s && s.trim() ? s.trim() : null);
const lineKey = (productId, customName, customMessage) => `${productId}|${customName ?? ''}|${customMessage ?? ''}`;

/**
 * One cart API for everyone. Guests keep lines in localStorage (synced across tabs); signed-in
 * shoppers use the server cart. On sign-in the guest cart is merged into the account.
 */
export function CartProvider({ children }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [guest, setGuest] = useState(() => storage.getJson(GUEST_CART_KEY, []));

  useEffect(() => {
    storage.setJson(GUEST_CART_KEY, guest);
  }, [guest]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === GUEST_CART_KEY) setGuest(storage.getJson(GUEST_CART_KEY, []));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const server = useQuery({ queryKey: ['cart'], queryFn: api.cart, enabled: !!user });

  // Fold the guest cart into the account once, right after sign-in. Until it lands, the cart
  // reports "loading" so checkout doesn't see a half-merged (empty) cart.
  const merging = useRef(false);
  const [mergePending, setMergePending] = useState(false);
  useEffect(() => {
    if (!user || guest.length === 0 || merging.current) return;
    merging.current = true;
    setMergePending(true);
    api
      .mergeCart(guest.map(({ productId, quantity, customName, customMessage }) => ({ productId, quantity, customName, customMessage })))
      .then((cart) => {
        qc.setQueryData(['cart'], cart);
        setGuest([]);
      })
      .catch(() => {
        /* keep the guest lines; the next sign-in retries */
      })
      .finally(() => {
        merging.current = false;
        setMergePending(false);
      });
  }, [user, guest, qc]);

  const items = useMemo(() => {
    if (user) {
      return (server.data?.items ?? []).map((i) => ({
        key: String(i.id),
        id: i.id,
        productId: i.productId,
        name: i.name,
        image: i.image,
        unitPrice: Number(i.unitPrice),
        quantity: i.quantity,
        lineTotal: Number(i.lineTotal),
        customName: i.customName,
        customMessage: i.customMessage,
        stock: i.stock,
        available: i.available,
      }));
    }
    return guest.map((l) => ({ ...l, lineTotal: l.unitPrice * l.quantity, available: true }));
  }, [user, server.data, guest]);

  const setServerCart = useCallback((cart) => qc.setQueryData(['cart'], cart), [qc]);

  const add = useCallback(
    async (product, quantity = 1, { customName, customMessage } = {}) => {
      const name = clean(customName);
      const message = clean(customMessage);
      if (user) {
        setServerCart(await api.addToCart({ productId: product.id, quantity, customName: name, customMessage: message }));
        return;
      }
      const key = lineKey(product.id, name, message);
      const cap = Math.min(MAX_QTY, product.stock ?? MAX_QTY);
      setGuest((lines) => {
        const existing = lines.find((l) => l.key === key);
        if (existing) {
          return lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(cap, l.quantity + quantity) } : l));
        }
        return [
          ...lines,
          {
            key,
            productId: product.id,
            name: product.name,
            image: product.image,
            unitPrice: Number(product.price),
            quantity: Math.min(cap, quantity),
            customName: name,
            customMessage: message,
            stock: product.stock,
          },
        ];
      });
    },
    [user, setServerCart],
  );

  const update = useCallback(
    async (key, quantity) => {
      const q = Math.max(1, Math.min(MAX_QTY, quantity));
      if (user) {
        setServerCart(await api.updateCartItem(key, q));
        return;
      }
      setGuest((lines) => lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(q, l.stock ?? MAX_QTY) } : l)));
    },
    [user, setServerCart],
  );

  const remove = useCallback(
    async (key) => {
      if (user) {
        setServerCart(await api.removeCartItem(key));
        return;
      }
      setGuest((lines) => lines.filter((l) => l.key !== key));
    },
    [user, setServerCart],
  );

  const clear = useCallback(async () => {
    if (user) {
      await api.clearCart();
      setServerCart({ items: [], itemCount: 0, subtotal: 0 });
      return;
    }
    setGuest([]);
  }, [user, setServerCart]);

  const refresh = useCallback(() => (user ? qc.invalidateQueries({ queryKey: ['cart'] }) : Promise.resolve()), [user, qc]);

  const value = useMemo(() => {
    const count = items.reduce((n, i) => n + i.quantity, 0);
    const subtotal = items.reduce((n, i) => n + i.lineTotal, 0);
    const loading = !!user && (server.isLoading || mergePending);
    return { items, count, subtotal, loading, add, update, remove, clear, refresh };
  }, [items, user, server.isLoading, mergePending, add, update, remove, clear, refresh]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
