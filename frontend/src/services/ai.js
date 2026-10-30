import { request } from './api/client.js';

/** The AI gift advisor. The model runs on the server; the browser only sends answers and gets real products back. */
export const aiApi = {
  recommend: (body) => request('/ai/recommendations', { method: 'POST', body }),
  giftMessages: (body) => request('/ai/gift-message', { method: 'POST', body }),
  /** A request in the shopper's own words ("I want to thank my sister…"): what was understood, and real picks. */
  giftRequest: (body) => request('/ai/gift-request', { method: 'POST', body }),
};
