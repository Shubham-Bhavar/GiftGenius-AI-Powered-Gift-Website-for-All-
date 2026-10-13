/**
 * GiftGenius API client: the one place that talks HTTP to the backend. The domain services
 * (services/catalog.js, services/orders.js, …) describe the endpoints; this file handles the transport.
 *
 * - Base URL: VITE_API_BASE + /api. Cookies are always sent (credentials: 'include').
 * - Errors become an ApiError with a user-safe message (`detail`) and per-field `errors`.
 * - The access token lives only in memory; the refresh token is an httpOnly cookie scoped to /api/auth.
 * - A 401 on an authenticated call triggers one refresh, then the call is retried once.
 * - Refreshes are serialised within the tab (shared promise) and across tabs (Web Locks API), so two
 *   tabs never present the same rotating refresh token at once.
 */
import { storage } from '../../utils/storage.js';

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '') + '/api';
const SESSION_HINT = 'gg-session';
/** Required by the API on cookie-authenticated calls (refresh, logout). */
export const CSRF_HEADER = { 'X-Requested-With': 'GiftGenius' };

export class ApiError extends Error {
  constructor(status, detail, errors) {
    super(detail || 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors || {};
  }
}

let accessToken = null;
let refreshing = null;
const listeners = new Set();

/** Subscribe to session changes: called with the user object, or null on sign-out. */
export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Starts (or, with null, ends) the in-memory session and tells subscribers. Used by the auth service. */
export function setSession(data) {
  accessToken = data?.accessToken ?? null;
  const user = data?.user ?? null;
  if (user) storage.set(SESSION_HINT, '1');
  else storage.remove(SESSION_HINT);
  listeners.forEach((fn) => fn(user));
  return user;
}

/** Ends the session locally (e.g. another tab signed out) without calling the server. */
export function forgetSession() {
  if (accessToken || storage.get(SESSION_HINT)) setSession(null);
}

export function hasSessionHint() {
  return storage.get(SESSION_HINT) === '1';
}

async function parse(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** One fetch with the API's headers; no refresh, no error parsing (the auth service's logout uses it). */
export async function rawFetch(path, { method = 'GET', body, headers = {}, auth = true, signal } = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (auth && accessToken) h.Authorization = `Bearer ${accessToken}`;
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError(0, "We couldn't reach GiftGenius. Check your connection and try again.");
  }
  return res;
}

async function doRefresh() {
  const res = await rawFetch('/auth/refresh', { method: 'POST', auth: false, headers: CSRF_HEADER });
  const data = await parse(res);
  if (res.status === 401 || res.status === 403) {
    setSession(null); // the session is really over
    return null;
  }
  if (!res.ok) {
    // 5xx or proxy error (e.g. a deploy in progress): not signed out, just unreachable. Keep the hint so
    // the next page load or 401 tries again.
    throw new ApiError(res.status, data?.detail);
  }
  return setSession(data);
}

/** Exchanges the refresh cookie for a new access token. Resolves to the user, or null if signed out. */
export function refreshSession() {
  if (refreshing) return refreshing;
  const run = () => doRefresh();
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  refreshing = (locks?.request ? locks.request('gg-refresh', run) : run())
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function request(path, opts = {}) {
  let res = await rawFetch(path, opts);
  if (res.status === 401 && opts.auth !== false && accessToken) {
    const user = await refreshSession();
    if (user) res = await rawFetch(path, opts);
  }
  const data = await parse(res);
  if (!res.ok) {
    throw new ApiError(res.status, data?.detail, data?.errors);
  }
  return data;
}

/** Query string from a params object, skipping empty values. */
export const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** For tests only. */
export function __resetApiForTests() {
  accessToken = null;
  refreshing = null;
  listeners.clear();
}
