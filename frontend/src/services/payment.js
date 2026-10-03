import { request } from './api/client.js';

/** Online payment. The server verifies every payment; the browser never marks an order paid itself. */
export const paymentApi = {
  verifyPayment: (number, body) =>
    request(`/orders/${encodeURIComponent(number)}/payment/verify`, { method: 'POST', body }),
};
