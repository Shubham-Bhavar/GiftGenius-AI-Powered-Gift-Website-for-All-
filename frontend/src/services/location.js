import { request } from './api/client.js';

/** Checkout's "Use my current location": rounded coordinates in the body, address parts back. */
export const locationApi = {
  reverseGeocode: (latitude, longitude) =>
    request('/location/reverse', { method: 'POST', body: { latitude, longitude } }),
};
