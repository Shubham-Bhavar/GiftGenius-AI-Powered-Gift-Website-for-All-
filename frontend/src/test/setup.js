import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { createDb, handlers } from './mockApi.js';
import { __resetApiForTests } from '../lib/api.js';

// findBy*/waitFor wait up to 5s (default 1s): busy CI machines can be slow to render a page's data.
configure({ asyncUtilTimeout: 5000 });

export const server = setupServer();
export let db = createDb();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  // The app calls relative URLs (/api/...); resolve them against the jsdom origin for Node's fetch.
  const patched = globalThis.fetch;
  globalThis.fetch = (input, init) =>
    patched(typeof input === 'string' && input.startsWith('/') ? new URL(input, 'http://localhost').href : input, init);
  // Match index.html (<html lang="en">), which the accessibility checks look at.
  document.documentElement.lang = 'en-IN';
  // jsdom has no scrollTo; the router's scroll restoration calls it.
  window.scrollTo = () => {};
});

beforeEach(() => {
  db = createDb();
  server.resetHandlers(...handlers(db));
  localStorage.clear();
  sessionStorage.clear();
  // The gift-box entry animation plays once per session; tests start after it (entry.test covers it).
  sessionStorage.setItem('gg-entry-shown', '1');
  // Likewise the first-visit welcome screen (welcome.test covers it).
  sessionStorage.setItem('gg-welcome-answered', '1');
  __resetApiForTests();
});

afterEach(() => cleanup());
afterAll(() => server.close());
