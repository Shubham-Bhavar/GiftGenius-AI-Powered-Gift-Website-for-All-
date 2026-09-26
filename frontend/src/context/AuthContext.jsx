import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, forgetSession, hasSessionHint, onSessionChange, refreshSession } from '../lib/api.js';

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
      qc.removeQueries({ queryKey: ['cart'] });
      qc.removeQueries({ queryKey: ['wishlist'] });
      qc.removeQueries({ queryKey: ['orders'] });
      qc.removeQueries({ queryKey: ['admin'] });
    }
  }, [user, qc]);

  const login = useCallback((email, password) => api.login(email, password), []);
  const register = useCallback((body) => api.register(body), []);
  const logout = useCallback(() => api.logout(), []);

  const value = useMemo(
    () => ({ user, ready, isAdmin: user?.role === 'ADMIN', login, register, logout, setUser }),
    [user, ready, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
