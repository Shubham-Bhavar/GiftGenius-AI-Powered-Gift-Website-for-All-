import { CSRF_HEADER, rawFetch, request, setSession } from './api/client.js';

/** Sign-in, accounts and passwords. Calls that start or end a session update the client's session too. */
export const authApi = {
  async login(email, password) {
    return setSession(await request('/auth/login', { method: 'POST', body: { email, password }, auth: false }));
  },
  async register(body) {
    return setSession(await request('/auth/register', { method: 'POST', body, auth: false }));
  },
  async logout() {
    try {
      await rawFetch('/auth/logout', { method: 'POST', auth: false, headers: CSRF_HEADER });
    } finally {
      setSession(null);
    }
  },
  /** A signed-in customer opens a store; the fresh session carries the SELLER role. */
  async becomeSeller(body) {
    return setSession(await request('/auth/seller-application', { method: 'POST', body }));
  },
  me: () => request('/auth/me'),
  updateProfile: (body) => request('/auth/me', { method: 'PATCH', body }),
  async changePassword(currentPassword, newPassword) {
    return setSession(await request('/auth/password/change', { method: 'POST', body: { currentPassword, newPassword } }));
  },
  forgotPassword: (email) => request('/auth/password/forgot', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token, password) =>
    request('/auth/password/reset', { method: 'POST', body: { token, password }, auth: false }),
};
