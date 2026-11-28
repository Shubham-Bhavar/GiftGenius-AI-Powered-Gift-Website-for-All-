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
 * - Every request gives up after a time limit (REQUEST_TIMEOUT_MS, or the call's `timeoutMs`) with an ApiError marked
 *   `timedOut`; a caller's own AbortSignal still cancels it with the usual AbortError.
 * - The number of requests in flight is published (onPendingChange), so the UI can say when the server is slow to wake.
 */
import { storage } from '../../utils/storage.js';

/**
 * The API root from VITE_API_BASE, the backend's origin (blank: this site's own /api). A value that already ends
 * in /api is taken as the same origin, so "https://api.example.com/api" never becomes /api/api/… (every call a 404).
 */
export function apiBase(origin) {
  return (origin ?? '').trim().replace(/\/+$/, '').replace(/\/api$/i, '') + '/api';
}

const BASE = apiBase(import.meta.env.VITE_API_BASE);
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

/**
 * How long one request may wait for the server's answer. A sleeping free-tier backend takes about two minutes to start,
 * so the limit sits above that; past it the request is abandoned instead of leaving the page waiting indefinitely.
 * VITE_API_TIMEOUT_MS overrides it at build time.
 */
export const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS) > 0
  ? Number(import.meta.env.VITE_API_TIMEOUT_MS) : 150_000;
export const TIMEOUT_MESSAGE = 'The server is taking too long to answer. Please try again in a moment.';

let requestTimeoutMs = REQUEST_TIMEOUT_MS;
/** The time limit in force (tests shorten it). */
export const requestTimeout = () => requestTimeoutMs;

let accessToken = null;
let refreshing = null;
const listeners = new Set();

let pending = 0;
const pendingListeners = new Set();
/** Requests currently waiting for the server. */
export const pendingRequests = () => pending;
/** Subscribe to the number of requests in flight; returns the unsubscribe function. */
export function onPendingChange(fn) {
  pendingListeners.add(fn);
  return () => pendingListeners.delete(fn);
}
function changePending(by) {
  pending = Math.max(0, pending + by);
  pendingListeners.forEach((fn) => fn(pending));
}

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
export async function rawFetch(path, { method = 'GET', body, headers = {}, auth = true, signal, timeoutMs } = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (auth && accessToken) h.Authorization = `Bearer ${accessToken}`;

  // One signal for both reasons to stop: the caller cancelling, or the time limit passing.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs ?? requestTimeoutMs);
  const onCallerAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) onCallerAbort();
  else signal?.addEventListener('abort', onCallerAbort, { once: true });

  changePending(1);
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (e) {
    if (timedOut) {
      const err = new ApiError(0, TIMEOUT_MESSAGE);
      err.timedOut = true;
      throw err;
    }
    if (e?.name === 'AbortError' || signal?.aborted) throw e;
    throw new ApiError(0, "We couldn't reach GiftGenius. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
    changePending(-1);
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
  requestTimeoutMs = REQUEST_TIMEOUT_MS;
  pending = 0;
}

/** For tests only: a shorter time limit for every request. */
export function __setRequestTimeoutForTests(ms) {
  requestTimeoutMs = ms;
}
