import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderApp, seedGuestCart } from './renderApp.jsx';
import { db } from './setup.js';

const original = Object.getOwnPropertyDescriptor(window.navigator, 'geolocation');

function mockGeolocation(impl) {
  const geo = impl === undefined ? undefined : { getCurrentPosition: vi.fn(impl), watchPosition: vi.fn() };
  Object.defineProperty(window.navigator, 'geolocation', { value: geo, configurable: true });
  return geo;
}

const allow = (lat = 19.0596123456, lon = 72.8295987654) => (ok) => ok({ coords: { latitude: lat, longitude: lon, accuracy: 20 } });
const deny = () => (_ok, fail) => fail({ code: 1, message: 'User denied Geolocation' });

async function openCheckout() {
  db.cookieUser = 1;
  localStorage.setItem('gg-session', '1');
  seedGuestCart([{ productId: 4, name: 'Signature Perfume', image: null, unitPrice: 1199, quantity: 1 }]);
  const utils = renderApp('/checkout');
  await screen.findByRole('heading', { level: 1, name: 'Delivery Details 📦' });
  await screen.findByRole('button', { name: /Place Order/ });
  return utils;
}

const status = () => document.getElementById('co-locate-status');

afterEach(() => {
  if (original) Object.defineProperty(window.navigator, 'geolocation', original);
  else delete window.navigator.geolocation;
});

describe('checkout: use my current location', () => {
  it('asks for location only when clicked, fills the address, and sends only rounded coordinates', async () => {
    const geo = mockGeolocation(allow());
    const { user } = await openCheckout();
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();

    const button = screen.getByRole('button', { name: /Use my current location/ });
    await user.click(button);

    await waitFor(() => expect(status()).toHaveTextContent('Location detected. Please check the address details below.'));
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(geo.watchPosition).not.toHaveBeenCalled();
    expect(db.geoRequests).toEqual([{ latitude: 19.0596, longitude: 72.8296 }]);
    expect(screen.getByLabelText('Address')).toHaveValue('14 Carter Road');
    expect(screen.getByLabelText('Area / Locality (optional)')).toHaveValue('Bandra West');
    expect(screen.getByLabelText('City')).toHaveValue('Mumbai');
    expect(screen.getByLabelText('State')).toHaveValue('Maharashtra');
    expect(screen.getByLabelText('Pincode')).toHaveValue('400050');
    expect(screen.getByLabelText('Country')).toHaveValue('India');
    expect(screen.getByRole('link', { name: 'OpenStreetMap contributors' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    // Coordinates are not shown anywhere.
    expect(document.body.textContent).not.toMatch(/19\.05|72\.82/);

    // The area travels with the street in the order's address line.
    await user.type(screen.getByLabelText('Phone'), '+91 98200 12345');
    await user.click(screen.getByRole('button', { name: /Place Order/ }));
    expect(await screen.findByRole('heading', { name: 'Order Placed Successfully!' })).toBeInTheDocument();
    expect(db.orders[0].dto.shipping.addressLine).toBe('14 Carter Road, Bandra West');
  });

  it('keeps a street the shopper already typed', async () => {
    mockGeolocation(allow());
    const { user } = await openCheckout();
    await user.type(screen.getByLabelText('Address'), 'Flat 7, Sea Breeze Apartments');
    await user.click(screen.getByRole('button', { name: /Use my current location/ }));
    await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue('Mumbai'));
    expect(screen.getByLabelText('Address')).toHaveValue('Flat 7, Sea Breeze Apartments');
  });

  it('explains a denied permission and leaves manual entry working', async () => {
    mockGeolocation(deny());
    const { user } = await openCheckout();
    await user.click(screen.getByRole('button', { name: /Use my current location/ }));
    await waitFor(() => expect(status()).toHaveTextContent('Location access was not allowed. You can enter your address manually.'));
    expect(db.geoRequests).toEqual([]);
    expect(screen.getByRole('button', { name: /Use my current location/ })).toBeEnabled();

    await user.type(screen.getByLabelText('Phone'), '+91 98765 43210');
    await user.type(screen.getByLabelText('Address'), '12 MG Road');
    await user.type(screen.getByLabelText('City'), 'Pune');
    await user.selectOptions(screen.getByLabelText('State'), 'Maharashtra');
    await user.type(screen.getByLabelText('Pincode'), '411001');
    await user.click(screen.getByRole('button', { name: /Place Order/ }));
    expect(await screen.findByRole('heading', { name: 'Order Placed Successfully!' })).toBeInTheDocument();
  });

  it('offers manual entry when the browser has no geolocation', async () => {
    mockGeolocation(undefined);
    const { user } = await openCheckout();
    await user.click(screen.getByRole('button', { name: /Use my current location/ }));
    expect(status()).toHaveTextContent("Your browser can't share your location. Please enter your address manually.");
  });

  it('offers manual entry when the address lookup fails, without exposing coordinates', async () => {
    mockGeolocation(allow());
    db.geoMode = 'down';
    const { user } = await openCheckout();
    await user.click(screen.getByRole('button', { name: /Use my current location/ }));
    await waitFor(() => expect(status()).toHaveTextContent('Could not detect your location. Enter your address manually.'));
    expect(screen.getByLabelText('City')).toHaveValue('');
    expect(document.body.textContent).not.toMatch(/19\.05|72\.82/);
  });

  it('does not fill a foreign address', async () => {
    mockGeolocation(allow(51.5007, -0.1246));
    db.geoMode = 'abroad';
    const { user } = await openCheckout();
    await user.click(screen.getByRole('button', { name: /Use my current location/ }));
    await waitFor(() => expect(status()).toHaveTextContent(/outside India/));
    expect(screen.getByLabelText('City')).toHaveValue('');
  });

  it('shows a loading state while locating', async () => {
    let finish;
    mockGeolocation((ok) => { finish = () => ok({ coords: { latitude: 19.06, longitude: 72.83 } }); });
    const { user } = await openCheckout();
    await user.click(screen.getByRole('button', { name: /Use my current location/ }));
    const button = screen.getByRole('button', { name: /Locating you…/ });
    expect(button).toBeDisabled();
    expect(within(status()).getByText('Locating you…')).toHaveClass('sr-only');
    finish();
    await waitFor(() => expect(status()).toHaveTextContent('Location detected'));
    expect(screen.getByRole('button', { name: /Use my current location/ })).toBeEnabled();
  });

  it('lists every Indian state and union territory', async () => {
    await openCheckout();
    const options = within(screen.getByLabelText('State')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toHaveLength(37); // "Choose…" + 28 states + 8 union territories
    expect(options).toEqual(expect.arrayContaining(['Sikkim', 'Ladakh', 'Manipur', 'Andaman and Nicobar Islands']));
  });
});
