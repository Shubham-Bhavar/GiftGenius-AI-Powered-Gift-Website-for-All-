import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MAX_QTY } from '../context/CartContext.jsx';
import { ordersQueries } from '../services/orders.js';
import { session } from '../utils/storage.js';

const KEY = 'gg-checkout';

function read() {
  return session.getJson(KEY, {});
}

/** Coupon and delivery choice, kept for the browser tab so they carry from the cart to checkout. */
export function useCheckoutPrefs() {
  const [prefs, setPrefs] = useState(() => ({ couponCode: '', deliveryType: 'STANDARD', ...read() }));
  const update = useCallback((changes) => {
    setPrefs((p) => {
      const next = { ...p, ...changes };
      session.setJson(KEY, next);
      return next;
    });
  }, []);
  return [prefs, update];
}

/**
 * Server-side price quote for the cart lines (prices, coupon, delivery fee, total). Lines go as they are, up to
 * 10 units each like the cart: personalised lines of one product are priced together by the server, exactly as
 * when the order is placed, so the total shown is the total charged.
 */
export function useQuote(items, couponCode, deliveryType) {
  const lines = useMemo(
    () => items.map((i) => ({ productId: i.productId, quantity: Math.min(i.quantity, MAX_QTY) })),
    [items],
  );
  const body = { items: lines, couponCode: couponCode || undefined, deliveryType };
  return useQuery({
    ...ordersQueries.quote(body),
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useCheckoutOptions() {
  return useQuery(ordersQueries.checkoutOptions());
}
