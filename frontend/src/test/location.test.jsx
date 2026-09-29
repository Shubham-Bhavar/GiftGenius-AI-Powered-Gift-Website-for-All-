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

const allow = (lat = 19.0596123456, lon = 72.8295987654, accuracy = 20) => (ok) => ok({ coords: { latitude: lat, longitude: lon, accuracy } });
const fail = (code) => (_ok, err) => err({ code, message: 'geolocation error' });

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
const panel = () => screen.queryByRole('group', { name: 'Detected address' });
const fieldValues = () => ['Address', 'Area / Locality (optional)', 'City', 'State', 'Pincode'].map((l) => screen.getByLabelText(l).value);

afterEach(() => {
  if (original) Object.defineProperty(window.navigator, 'geolocation', original);
  else delete window.navigator.geolocation;
});

describe('checkout: use my current location', () => {
  it('asks only on click for a fresh, accurate fix and shows the address for confirmation before filling anything', async () => {
    const geo = mockGeolocation(allow());
    const { user } = await openCheckout();
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Use my current location/ }));
    const detected = await screen.findByRole('group', { name: 'Detected address' });

    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(geo.getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
    expect(geo.watchPosition).not.toHaveBeenCalled();
    // Rounded to 5 decimals (about 1 m) before being sent; never shown.
    expect(db.geoRequests).toEqual([{ latitude: 19.05961, longitude: 72.8296 }]);
    expect(document.body.textContent).not.toMatch(/19\.05|72\.82/);

    expect(status()).toHaveTextContent('Location detected. Check the address below, then choose “Use this address”.');
    expect(within(detected).getByText('14 Carter Road')).toBeInTheDocument();
    expect(within(detected).getByText('Bandra West')).toBeInTheDocument();
    expect(within(detected).getByText('Mumbai')).toBeInTheDocument();
    expect(within(detected).getByText('400050')).toBeInTheDocument();
    expect(within(detected).queryByText(/estimate your location/)).toBeNull(); // accurate fix: no warning
    expect(within(detected).getByRole('link', { name: 'OpenStreetMap contributors' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    // Nothing is filled until the shopper confirms.
    expect(fieldValues()).toEqual(['', '', '', '', '']);

    await user.click(within(detected).getByRole('button', { name: 'Use this address' }));
    expect(panel()).toBeNull();
    expect(fieldValues()).toEqual(['14 Carter Road', 'Bandra West', 'Mumbai', 'Maharashtra', '400050']);
    expect(screen.getByLabelText('Country')).toHaveValue('India');
    await waitFor(() => expect(screen.getByLabelText('Address')).toHaveFocus());
    expect(status()).toHaveTextContent('Address filled in from your location. Add your flat or house number');

    // The area travels with the street in the order's address line.
    await user.type(screen.getByLabelText('Phone'), '+91 98200 12345');
    await user.click(screen.getByRole('button', { name: /Place Order/ }));
    expect(await screen.findByRole('heading', { name: 'Order Placed Successfully!' })).toBeInTheDocument();
    expect(db.orders[0].dto.shipping.addressLine).toBe('14 Carter Road, Bandra West');
  });

  it('warns when the browser could only estimate the location, and "Edit manually" leaves the form untouched', async () => {
    mockGeolocation(allow(18.5146, 73.887, 18_000)); // a network-based estimate, ±18 km
    const { user } = await openCheckout();
    await user.type(screen.getByLabelText('City'), 'Sangamner');
    await user.click(screen.getByRole('button', { name: /Use my current location/ }));
    const detected = await screen.findByRole('group', { name: 'Detected address' });
    expect(within(detected).getByText(/could only estimate your location \(to within about 18 km\), so this may not be your address/)).toBeInTheDocument();

    await user.click(within(detected).getByRole('button', { name: 'Edit manually' }));
    expect(panel()).toBeNull();
    expect(screen.getByLabelText('City')).toHaveValue('Sangamner');
    expect(screen.getByLabelText('Area / Locality (optional)')).toHaveValue('');
    await waitFor(() => expect(screen.getByLabelText('Address')).toHaveFocus());
  });

  it('keeps a street the shopper already typed', async () => {
    mockGeolocation(allow());
    const { user } = await openCheckout();
    await user.type(screen.getByLabelText('Address'), 'Flat 7, Sea Breeze Apartments');
    await user.click(screen.getByRole('button', { name: /Use my current location/ }));
    const detected = await screen.findByRole('group', { name: 'Detected address' });
    expect(within(detected).getByText('Your street address stays as you typed it.')).toBeInTheDocument();
    await user.click(within(detected).getByRole('button', { name: 'Use this address' }));
    expect(screen.getByLabelText('Address')).toHaveValue('Flat 7, Sea Breeze Apartments');
    expect(screen.getByLabelText('City')).toHaveValue('Mumbai');
  });

  it('explains a denied permission and leaves manual entry working', async () => {
    mockGeolocation(fail(1));
    const { user } = await openCheckout();
    await user.click(screen.getByRole('button', { name: /Use my current location/ }));
    await waitFor(() => expect(status()).toHaveTextContent('Location access was not allowed. You can enter your address manually.'));
    expect(db.geoRequests).toEqual([]);
    expect(panel()).toBeNull();
    expect(screen.getByRole('button', { name: /Use my current location/ })).toBeEnabled();

    await user.type(screen.getByLabelText('Phone'), '+91 98765 43210');
    await user.type(screen.getByLabelText('Address'), '12 MG Road');
    await user.type(screen.getByLabelText('City'), 'Pune');
    await user.selectOptions(screen.getByLabelText('State'), 'Maharashtra');
    await user.type(screen.getByLabelText('Pincode'), '411001');
    await user.click(screen.getByRole('button', { name: /Place Order/ }));
    expect(await screen.findByRole('heading', { name: 'Order Placed Successfully!' })).toBeInTheDocument();
  });

  it('explains a timeout and an unavailable position', async () => {
    mockGeolocation(fail(3));
    const { user, unmount } = await openCheckout();
    await user.click(screen.getByRole('button', { name: /Use my current location/ }));
    await waitFor(() => expect(status()).toHaveTextContent('Finding your location took too long. Try again, or enter your address manually.'));
    unmount();

    mockGeolocation(fail(2));
    const again = await openCheckout();
    await again.user.click(screen.getByRole('button', { name: /Use my current location/ }));
    await waitFor(() => expect(status()).toHaveTextContent("Your device couldn't work out its location. Please enter your address manually."));
    expect(db.geoRequests).toEqual([]);
  });

  it('never sends invalid coordinates', async () => {
    mockGeolocation(allow(Number.NaN, 72.8));
    const { user } = await openCheckout();
    await user.click(screen.getByRole('button', { name: /Use my current location/ }));
    await waitFor(() => expect(status()).toHaveTextContent("Your device couldn't work out its location."));
    expect(db.geoRequests).toEqual([]);
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
    expect(panel()).toBeNull();
    expect(fieldValues()).toEqual(['', '', '', '', '']);
    expect(document.body.textContent).not.toMatch(/19\.05|72\.82/);
  });

  it('does not offer a foreign address', async () => {
    mockGeolocation(allow(51.5007, -0.1246));
    db.geoMode = 'abroad';
    const { user } = await openCheckout();
    await user.click(screen.getByRole('button', { name: /Use my current location/ }));
    await waitFor(() => expect(status()).toHaveTextContent('We currently deliver within India. Please enter an Indian delivery address.'));
    expect(panel()).toBeNull();
    expect(screen.getByLabelText('City')).toHaveValue('');
  });

  it('shows a loading state while locating', async () => {
    let finish;
    mockGeolocation((ok) => { finish = () => ok({ coords: { latitude: 19.06, longitude: 72.83, accuracy: 15 } }); });
    const { user } = await openCheckout();
    await user.click(screen.getByRole('button', { name: /Use my current location/ }));
    const button = screen.getByRole('button', { name: /Locating you…/ });
    expect(button).toBeDisabled();
    expect(within(status()).getByText('Locating you…')).toHaveClass('sr-only');
    finish();
    await screen.findByRole('group', { name: 'Detected address' });
    expect(screen.getByRole('button', { name: /Use my current location/ })).toBeEnabled();
  });

  it('lists every Indian state and union territory', async () => {
    await openCheckout();
    const options = within(screen.getByLabelText('State')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toHaveLength(37); // "Choose…" + 28 states + 8 union territories
    expect(options).toEqual(expect.arrayContaining(['Sikkim', 'Ladakh', 'Manipur', 'Andaman and Nicobar Islands']));
  });
});
