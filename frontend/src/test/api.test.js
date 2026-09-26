import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { api, hasSessionHint, refreshSession, request } from '../lib/api.js';
import { API } from './mockApi.js';
import { db, server } from './setup.js';

describe('api client', () => {
  it('turns problem+json errors into ApiError with field errors', async () => {
    await expect(api.register({ fullName: 'A', email: 'new@example.com', password: 'x' })).rejects.toMatchObject({
      status: 400,
      message: 'Some fields need attention.',
      errors: { password: 'Use 8 to 72 characters' },
    });
  });

  it('refreshes once on 401 and retries the call', async () => {
    await api.login('asha@example.com', 'correct-horse');
    db.tokens = {}; // the access token "expires"
    const me = await api.me();
    expect(me.email).toBe('asha@example.com');
    expect(db.refreshCount).toBe(1);
  });

  it('shares one refresh between parallel 401s', async () => {
    await api.login('asha@example.com', 'correct-horse');
    db.tokens = {};
    await Promise.all([api.me(), api.me(), api.cart()]);
    expect(db.refreshCount).toBe(1);
  });

  it('sends the CSRF header on refresh and stores a session hint', async () => {
    await api.login('asha@example.com', 'correct-horse');
    expect(hasSessionHint()).toBe(true);
    const user = await refreshSession();
    expect(user.email).toBe('asha@example.com');
    const call = db.calls.find((c) => c.url === '/api/auth/refresh');
    expect(call.headers.get('X-Requested-With')).toBe('GiftGenius');
  });

  it('keeps the session when the server is briefly unavailable, ends it on 401', async () => {
    await api.login('asha@example.com', 'correct-horse');
    db.refreshStatus = 502;
    expect(await refreshSession()).toBeNull();
    expect(hasSessionHint()).toBe(true);

    db.refreshStatus = 401;
    expect(await refreshSession()).toBeNull();
    expect(hasSessionHint()).toBe(false);
  });

  it('reports network failures in plain language', async () => {
    server.use(http.get(`${API}/products`, () => HttpResponse.error()));
    await expect(request('/products')).rejects.toMatchObject({ status: 0, message: expect.stringContaining("couldn't reach") });
  });
});
