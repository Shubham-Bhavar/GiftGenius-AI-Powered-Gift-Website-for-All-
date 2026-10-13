import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { forgetSession, hasSessionHint, onSessionChange, refreshSession } from '../services/api/client.js';
import { authApi } from '../services/auth.js';
import { cartKeys } from '../services/cart.js';
import { wishlistKeys } from '../services/wishlist.js';
import { ordersKeys } from '../services/orders.js';
import { sellerKeys } from '../services/seller.js';
import { adminKeys } from '../services/admin.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [user, setUser] = useState(null);
  // Guests are "ready" immediately; returning shoppers wait for the silent session restore.
  const [ready, setReady] = useState(() => !hasSessionHint());

  useEffect(() => onSessionChange(setUser), []);

  useEffect(() => {
    if (!hasSessionHint()) return;
    refreshSession().finally(() => setReady(true));
  }, []);

  // Signing out in another tab signs this tab out too.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'gg-session' && e.newValue === null) forgetSession();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Drop every per-user cache on sign-out.
  useEffect(() => {
    if (!user) {
      qc.removeQueries({ queryKey: cartKeys.cart() });
      qc.removeQueries({ queryKey: wishlistKeys.wishlist() });
      qc.removeQueries({ queryKey: ordersKeys.all() });
      qc.removeQueries({ queryKey: adminKeys.all() });
      qc.removeQueries({ queryKey: sellerKeys.all() });
    }
  }, [user, qc]);

  const login = useCallback((email, password) => authApi.login(email, password), []);
  const register = useCallback((body) => authApi.register(body), []);
  const logout = useCallback(() => authApi.logout(), []);

  const value = useMemo(
    // Role flags only choose what to show; the API enforces every role on every request.
    () => ({ user, ready, isAdmin: user?.role === 'ADMIN', isSeller: user?.role === 'SELLER', login, register, logout, setUser }),
    [user, ready, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
