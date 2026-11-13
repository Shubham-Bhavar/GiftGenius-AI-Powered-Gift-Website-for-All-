import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cartApi, cartKeys, cartQueries } from '../services/cart.js';
import { storage } from '../utils/storage.js';
import { useAuth } from './AuthContext.jsx';

export const GUEST_CART_KEY = 'gg-cart';
export const MAX_QTY = 10;

const CartContext = createContext(null);

const clean = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);
const lineKey = (productId, customName, customMessage) => `${productId}|${customName ?? ''}|${customMessage ?? ''}`;

/**
 * The guest cart as stored, made safe to use: anything that isn't a list of cart lines (a value from an older version,
 * another tab or a hand edit) becomes an empty cart, malformed lines are dropped, quantities are clamped to 1–10 and
 * every line gets its key again. Never throws: a bad value must not blank the site.
 */
export function readGuestCart(value) {
  if (!Array.isArray(value)) return [];
  const byKey = new Map();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const productId = Number(raw.productId);
    const quantity = Math.floor(Number(raw.quantity));
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(quantity) || quantity < 1) continue;
    const customName = clean(raw.customName);
    const customMessage = clean(raw.customMessage);
    const key = lineKey(productId, customName, customMessage);
    const unitPrice = Number(raw.unitPrice);
    const stock = Number.isInteger(raw.stock) && raw.stock >= 0 ? raw.stock : undefined;
    const previous = byKey.get(key);
    byKey.set(key, {
      key, productId, customName, customMessage, stock,
      name: typeof raw.name === 'string' ? raw.name : '',
      image: typeof raw.image === 'string' ? raw.image : null,
      unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
      quantity: Math.min(MAX_QTY, quantity + (previous?.quantity ?? 0)),
    });
  }
  return [...byKey.values()];
}

/**
 * One cart API for everyone. Guests keep lines in localStorage (synced across tabs); signed-in
 * shoppers use the server cart. On sign-in the guest cart is merged into the account.
 */
export function CartProvider({ children }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [guest, setGuest] = useState(() => readGuestCart(storage.getJson(GUEST_CART_KEY, [])));

  useEffect(() => {
    storage.setJson(GUEST_CART_KEY, guest);
  }, [guest]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === GUEST_CART_KEY) setGuest(readGuestCart(storage.getJson(GUEST_CART_KEY, [])));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const server = useQuery({ ...cartQueries.cart(), enabled: !!user });

  // Lines with a change on its way to the server: their controls wait for it, so quick clicks each start from the
  // quantity the server last confirmed instead of all sending the same one.
  const [pendingKeys, setPendingKeys] = useState(() => new Set());

  // Fold the guest cart into the account once, right after sign-in. Until it lands, the cart
  // reports "loading" so checkout doesn't see a half-merged (empty) cart.
  const merging = useRef(false);
  const [mergePending, setMergePending] = useState(false);
  useEffect(() => {
    if (!user || guest.length === 0 || merging.current) return;
    merging.current = true;
    setMergePending(true);
    cartApi
      .mergeCart(guest.map(({ productId, quantity, customName, customMessage }) => ({ productId, quantity, customName, customMessage })))
      .then(async (cart) => {
        // A cart read started before the merge committed must not land after it and undo it.
        await qc.cancelQueries({ queryKey: cartKeys.cart() });
        qc.setQueryData(cartKeys.cart(), cart);
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
        pending: pendingKeys.has(String(i.id)),
      }));
    }
    return guest.map((l) => ({ ...l, lineTotal: l.unitPrice * l.quantity, available: true, pending: false }));
  }, [user, server.data, guest, pendingKeys]);

  const setServerCart = useCallback((cart) => qc.setQueryData(cartKeys.cart(), cart), [qc]);

  const whilePending = useCallback(async (key, work) => {
    setPendingKeys((s) => new Set(s).add(key));
    try {
      return await work();
    } finally {
      setPendingKeys((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const add = useCallback(
    async (product, quantity = 1, { customName, customMessage } = {}) => {
      const name = clean(customName);
      const message = clean(customMessage);
      if (user) {
        setServerCart(await cartApi.addToCart({ productId: product.id, quantity, customName: name, customMessage: message }));
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
        await whilePending(key, async () => setServerCart(await cartApi.updateCartItem(key, q)));
        return;
      }
      setGuest((lines) => lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(q, l.stock ?? MAX_QTY) } : l)));
    },
    [user, setServerCart, whilePending],
  );

  const remove = useCallback(
    async (key) => {
      if (user) {
        await whilePending(key, async () => setServerCart(await cartApi.removeCartItem(key)));
        return;
      }
      setGuest((lines) => lines.filter((l) => l.key !== key));
    },
    [user, setServerCart, whilePending],
  );

  const clear = useCallback(async () => {
    if (user) {
      await cartApi.clearCart();
      setServerCart({ items: [], itemCount: 0, subtotal: 0 });
      return;
    }
    setGuest([]);
  }, [user, setServerCart]);

  const refresh = useCallback(() => (user ? qc.invalidateQueries({ queryKey: cartKeys.cart() }) : Promise.resolve()), [user, qc]);

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
