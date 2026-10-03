import { request } from './api/client.js';

/** Talking to us: the contact form and the newsletter. */
export const supportApi = {
  subscribe: (email) => request('/newsletter/subscribe', { method: 'POST', body: { email }, auth: false }),
  contact: (body) => request('/contact', { method: 'POST', body }),
};
