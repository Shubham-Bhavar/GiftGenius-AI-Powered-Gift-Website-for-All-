import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { QueryClient } from '@tanstack/react-query';
import {
  ApiError, TIMEOUT_MESSAGE, __setRequestTimeoutForTests, onPendingChange, pendingRequests, request,
} from '../services/api/client.js';
import { catalogApi } from '../services/catalog.js';
import { shouldRetry } from '../app/queryClient.js';
import { WAKE_MESSAGE, __setWakeNoticeDelayForTests } from '../components/layout/ServerWakeNotice.jsx';
import { renderApp } from './renderApp.jsx';
import { db, server } from './setup.js';

const API = 'http://localhost/api';

/** A handler that holds every request until release() (or for good, if never released). */
function held(method, path, respond) {
  const waiting = [];
  let calls = 0;
  server.use(http[method](`${API}${path}`, async (info) => {
    calls += 1;
    await new Promise((resolve) => waiting.push(resolve));
    return respond ? respond(info) : undefined;
  }));
  return {
    calls: () => calls,
    release: () => waiting.splice(0).forEach((resolve) => resolve()),
  };
}

const releases = [];
afterEach(() => {
  releases.splice(0).forEach((release) => release());
  __setWakeNoticeDelayForTests();
});

describe('request time limit', () => {
  it('gives up after the time limit with a clear ApiError marked timedOut', async () => {
    const hold = held('get', '/products');
    releases.push(hold.release);
    const err = await request('/products', { timeoutMs: 50 }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, timedOut: true, message: TIMEOUT_MESSAGE });
  });

  it('applies the app-wide limit to every call (configurable; 150 s by default)', async () => {
    const hold = held('get', '/products');
    releases.push(hold.release);
    __setRequestTimeoutForTests(50);
    await expect(catalogApi.products({ size: 100 })).rejects.toMatchObject({ timedOut: true });
  });

  it('a caller cancelling still gets the AbortError, not a timeout or network error', async () => {
    const hold = held('get', '/products');
    releases.push(hold.release);
    const controller = new AbortController();
    const call = request('/products', { signal: controller.signal, timeoutMs: 10_000 });
    controller.abort();
    const err = await call.catch((e) => e);
    expect(err.name).toBe('AbortError');
    expect(err).not.toBeInstanceOf(ApiError);
  });

  it('a signal already cancelled stops the call at once', async () => {
    const controller = new AbortController();
    controller.abort();
    const err = await request('/products', { signal: controller.signal }).catch((e) => e);
    expect(err.name).toBe('AbortError');
  });

  it('a request that answers in time is unaffected, and other failures keep their own message', async () => {
    const page = await request('/products', { timeoutMs: 5000 });
    expect(page.content.length).toBeGreaterThan(0);

    server.use(http.get(`${API}/products/categories`, () => HttpResponse.error()));
    await expect(request('/products/categories')).rejects.toMatchObject({
      status: 0, message: "We couldn't reach GiftGenius. Check your connection and try again.",
    });
  });

  it('counts requests in flight and always counts them back down', async () => {
    const seen = [];
    const stop = onPendingChange((n) => seen.push(n));
    const hold = held('get', '/products');
    releases.push(hold.release);

    const slow = request('/products', { timeoutMs: 50 }).catch((e) => e);
    expect(pendingRequests()).toBe(1);
    await slow; // timed out
    expect(pendingRequests()).toBe(0);

    const controller = new AbortController();
    const cancelled = request('/products', { signal: controller.signal }).catch((e) => e);
    controller.abort();
    await cancelled;
    expect(pendingRequests()).toBe(0);
    stop();
    expect(seen).toEqual([1, 0, 1, 0]);
  });
});

describe('retries', () => {
  it('retries a timed-out request once only, other server failures twice, client errors never', () => {
    const timeout = Object.assign(new ApiError(0, TIMEOUT_MESSAGE), { timedOut: true });
    expect(shouldRetry(0, timeout)).toBe(true);
    expect(shouldRetry(1, timeout)).toBe(false);

    const unreachable = new ApiError(0, 'down');
    const serverError = new ApiError(503, 'deploying');
    for (const err of [unreachable, serverError]) {
      expect([0, 1, 2].map((n) => shouldRetry(n, err))).toEqual([true, true, false]);
    }
    expect(shouldRetry(0, new ApiError(404, 'missing'))).toBe(false);
    expect(shouldRetry(0, new ApiError(401, 'signed out'))).toBe(false);
  });

  it('a query that keeps timing out is asked for twice in total, then reports the timeout', async () => {
    const hold = held('get', '/products');
    releases.push(hold.release);
    __setRequestTimeoutForTests(40);
    const client = new QueryClient();
    const err = await client.fetchQuery({
      queryKey: ['slow'], queryFn: () => request('/products'), retry: shouldRetry, retryDelay: 0,
    }).catch((e) => e);
    expect(err).toMatchObject({ timedOut: true, message: TIMEOUT_MESSAGE });
    expect(hold.calls()).toBe(2);
  });
});

describe('restoring a session from a slow server', () => {
  it('stops retrying once the time limit is used up, and shows the site', async () => {
    db.cookieUser = 1;
    localStorage.setItem('gg-session', '1');
    const hold = held('post', '/auth/refresh');
    releases.push(hold.release);
    __setRequestTimeoutForTests(100);
    renderApp('/');
    expect(await screen.findByRole('button', { name: 'Sign in to your account' })).toBeInTheDocument();
    expect(hold.calls()).toBe(1); // no second and third long wait
  });
});

describe('"waking up" notice', () => {
  it('appears on the "Restoring your session…" screen while the server is slow to answer', async () => {
    db.cookieUser = 1;
    localStorage.setItem('gg-session', '1');
    const hold = held('post', '/auth/refresh');
    releases.push(hold.release);
    __setWakeNoticeDelayForTests(50);
    renderApp('/');
    expect(screen.getByText('Restoring your session…')).toBeInTheDocument();
    const notice = screen.getByRole('status', { name: 'Server status' });
    await waitFor(() => expect(notice).toHaveTextContent(WAKE_MESSAGE));

    hold.release(); // the server answers: signed in, notice gone
    expect(await screen.findByRole('button', { name: 'Account menu for Asha Rao' })).toBeInTheDocument();
    await waitFor(() => expect(notice).toBeEmptyDOMElement());
  });

  it('home: announces the catalogue loading, explains a long wait, and clears both when the gifts arrive', async () => {
    const hold = held('get', '/products');
    releases.push(hold.release);
    __setWakeNoticeDelayForTests(50);
    renderApp('/');
    expect(await screen.findByText('Loading gifts…')).toHaveAttribute('role', 'status');
    const notice = screen.getByRole('status', { name: 'Server status' });
    await waitFor(() => expect(notice).toHaveTextContent(WAKE_MESSAGE));

    hold.release();
    expect(await screen.findByRole('button', { name: 'Add Signature Perfume to cart' })).toBeInTheDocument();
    expect(screen.queryByText('Loading gifts…')).not.toBeInTheDocument();
    await waitFor(() => expect(notice).toBeEmptyDOMElement());
  });

  it('shop: announces the catalogue loading', async () => {
    const hold = held('get', '/products');
    releases.push(hold.release);
    renderApp('/shop');
    expect(await screen.findByText('Loading gifts…')).toHaveAttribute('role', 'status');
    hold.release();
    await waitFor(() => expect(screen.queryByText('Loading gifts…')).not.toBeInTheDocument());
  });

  it('stays quiet when the server answers quickly', async () => {
    __setWakeNoticeDelayForTests(1500);
    renderApp('/');
    expect(await screen.findByRole('button', { name: 'Add Signature Perfume to cart' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(screen.getByRole('status', { name: 'Server status' })).toBeEmptyDOMElement();
  });
});

describe('gift finder progress', () => {
  it('"Scoring your matches…" is a status message', async () => {
    const hold = held('post', '/ai/recommendations');
    releases.push(hold.release);
    const { user } = renderApp('/gift-finder');
    expect(await screen.findByText('01 / 07')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Partner \/ Spouse/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: /Anniversary/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: /Flowers & Fragrance/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: 'Skip →' }));
    await user.click(screen.getByRole('button', { name: /Luxury & Premium/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: /₹500 – ₹1,500/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: '✨ Find My Gifts' }));
    expect(await screen.findByText('Scoring your matches…')).toHaveAttribute('role', 'status');
  });
});

it('product-card placeholders do not shimmer when reduced motion is requested', () => {
  const css = readFileSync('src/styles/components/product-card.css', 'utf8');
  const rule = css.match(/@media \(prefers-reduced-motion: reduce\) \{([^}]*)\}/);
  expect(rule?.[1]).toMatch(/\.pcard--skeleton \.pcard-img[^{]*\.pcard--skeleton \.pcard-name[^{]*\.pcard--skeleton \.pcard-cat\s*\{\s*animation: none;/);
});
