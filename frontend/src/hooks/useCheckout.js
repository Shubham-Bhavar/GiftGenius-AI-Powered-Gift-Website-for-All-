import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

const KEY = 'gg-checkout';

function read() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

/** Coupon and delivery choice, kept for the browser tab so they carry from the cart to checkout. */
export function useCheckoutPrefs() {
  const [prefs, setPrefs] = useState(() => ({ couponCode: '', deliveryType: 'STANDARD', ...read() }));
  const update = useCallback((changes) => {
    setPrefs((p) => {
      const next = { ...p, ...changes };
      try {
        sessionStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return [prefs, update];
}

/** Server-side price quote for the cart lines (prices, coupon, delivery fee, total). */
export function useQuote(items, couponCode, deliveryType) {
  const lines = useMemo(() => {
    const byProduct = new Map();
    items.forEach((i) => byProduct.set(i.productId, (byProduct.get(i.productId) ?? 0) + i.quantity));
    return [...byProduct].map(([productId, quantity]) => ({ productId, quantity: Math.min(quantity, 10) }));
  }, [items]);
  const body = { items: lines, couponCode: couponCode || undefined, deliveryType };
  return useQuery({
    queryKey: ['quote', body],
    queryFn: () => api.quote(body),
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useCheckoutOptions() {
  return useQuery({ queryKey: ['checkout-options'], queryFn: api.checkoutOptions, staleTime: 5 * 60_000 });
}
