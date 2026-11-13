import { request } from './api/client.js';

/** The Gift Studio's box composer: boxes of several gifts within a budget, and how well chosen gifts go together. */
export const giftBoxApi = {
  suggestions: (body) => request('/gift-box/suggestions', { method: 'POST', body }),
  check: (body, signal) => request('/gift-box/check', { method: 'POST', body, signal }),
};
