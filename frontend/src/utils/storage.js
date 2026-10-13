/** localStorage that never throws (private mode, blocked storage, quota) and speaks JSON. */
export const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  getJson(key, fallback) {
    const raw = this.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  setJson(key, value) {
    this.set(key, JSON.stringify(value));
  },
};

/**
 * sessionStorage (this tab only) the same way: never throws. `ifBlocked` is what get() returns when the browser
 * blocks storage, for callers that must tell "blocked" from "not set".
 */
export const session = {
  get(key, ifBlocked = null) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return ifBlocked;
    }
  },
  set(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  getJson(key, fallback) {
    const raw = this.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) || fallback;
    } catch {
      return fallback;
    }
  },
  setJson(key, value) {
    this.set(key, JSON.stringify(value));
  },
};
