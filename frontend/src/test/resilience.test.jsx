import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { renderApp, seedGuestCart } from './renderApp.jsx';
import { db, server } from './setup.js';
import { readGuestCart } from '../context/CartContext.jsx';
import { readGuestWishlist } from '../context/WishlistContext.jsx';

const API = 'http://localhost/api';

function signedInAs(userId) {
  db.cookieUser = userId;
  localStorage.setItem('gg-session', '1');
}

describe('saved cart and wishlist in an unexpected shape', () => {
  it('reads only valid lines, clamps quantities, rebuilds keys and merges duplicates', () => {
    expect(readGuestCart(null)).toEqual([]);
    expect(readGuestCart({ items: [] })).toEqual([]);
    expect(readGuestCart('x')).toEqual([]);
    const lines = readGuestCart([
      null, 'x', { productId: 'abc', quantity: 1 }, { productId: 4, quantity: 0 }, { productId: -1, quantity: 1 },
      { productId: 4, quantity: 25, name: 'Signature Perfume', unitPrice: 1199 },
      { productId: '4', quantity: 2, name: 'Signature Perfume', unitPrice: 1199 },
      { productId: 4, quantity: 1, customName: ' Asha ', unitPrice: 'free' },
    ]);
    expect(lines).toEqual([
      expect.objectContaining({ key: '4||', productId: 4, quantity: 10, unitPrice: 1199 }),
      expect.objectContaining({ key: '4|Asha|', productId: 4, quantity: 1, customName: 'Asha', unitPrice: 0 }),
    ]);
    expect(readGuestWishlist({ ids: [1] })).toEqual([]);
    expect(readGuestWishlist([{ id: 3 }, { id: 3 }, { id: 'x' }, null, { id: 6 }]).map((p) => p.id)).toEqual([3, 6]);
  });

  it.each([
    ['an object from an older version', '{"items":[]}'],
    ['null', 'null'],
    ['lines without product ids', '[{"name":"x","quantity":2}]'],
  ])('a saved cart that is %s never blanks the site', async (_, value) => {
    localStorage.setItem('gg-cart', value);
    localStorage.setItem('gg-wishlist', '{"items":[1]}');
    renderApp('/cart');
    expect((await screen.findAllByText(/Your cart is empty/i)).length).toBeGreaterThan(0);
    expect(screen.getByTestId('cart-count')).toHaveTextContent('0');
  });
});

describe('restoring a session through a brief outage', () => {
  it('retries after a 503 instead of showing a signed-in shopper as signed out', async () => {
    signedInAs(1);
    let calls = 0;
    server.use(http.post(`${API}/auth/refresh`, () => {
      calls += 1;
      return calls === 1 ? HttpResponse.json({ status: 503, detail: 'Deploying' }, { status: 503 }) : undefined;
    }));
    renderApp('/');
    expect(await screen.findByRole('button', { name: 'Account menu for Asha Rao' }, { timeout: 4000 })).toBeInTheDocument();
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('a session that has really ended (401) shows the site signed out at once', async () => {
    signedInAs(null);
    localStorage.setItem('gg-session', '1');
    renderApp('/');
    expect(await screen.findByRole('button', { name: 'Sign in to your account' })).toBeInTheDocument();
    expect(localStorage.getItem('gg-session')).toBeNull();
  });
});

describe('checkout and cart under slow or failing requests', () => {
  it('checkout says when the price can’t be worked out, and can try again', async () => {
    signedInAs(1);
    db.carts[1] = [{ id: 91, productId: 4, quantity: 1, customName: null, customMessage: null }];
    let fail = true;
    server.use(http.post(`${API}/checkout/quote`, () => (fail
      ? HttpResponse.json({ status: 503, detail: 'Unavailable' }, { status: 503 }) : undefined)));
    const { user } = renderApp('/checkout');
    const retry = await screen.findByRole('button', { name: /try again/i }, { timeout: 8000 });
    expect(screen.getByRole('button', { name: /Place Order|Pay|Updating/ })).toBeDisabled();
    fail = false;
    await user.click(retry);
    await waitFor(() => expect(screen.getByRole('button', { name: /Place Order · ₹/ })).toBeEnabled());
  });

  it('while a changed delivery option is being priced, the button shows no stale total and can’t be pressed', async () => {
    signedInAs(1);
    db.carts[1] = [{ id: 93, productId: 4, quantity: 1, customName: null, customMessage: null }];
    const { user } = renderApp('/checkout');
    await waitFor(() => expect(screen.getByRole('button', { name: /Place Order · ₹/ })).toBeEnabled());
    server.use(http.post(`${API}/checkout/quote`, async () => {
      await delay(400);
      return undefined;
    }));
    await user.selectOptions(screen.getByLabelText('Delivery Option'), 'EXPRESS');
    expect(await screen.findByRole('button', { name: 'Updating the total…' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: /Place Order · ₹/ })).toBeEnabled());
  });

  it('a quantity change waits for the server before the next one, so quick clicks add up', async () => {
    signedInAs(1);
    db.carts[1] = [{ id: 92, productId: 1, quantity: 1, customName: null, customMessage: null }];
    server.use(http.patch(`${API}/cart/items/:id`, async () => {
      await delay(150);
      return undefined;
    }));
    const { user } = renderApp('/cart');
    const stepper = within(await screen.findByRole('group', { name: 'Quantity of Luxury Hamper Box' }));
    await user.click(stepper.getByRole('button', { name: 'Increase quantity' }));
    expect(stepper.getByRole('button', { name: 'Increase quantity' })).toBeDisabled(); // while the change is on its way
    await waitFor(() => expect(stepper.getByRole('button', { name: 'Increase quantity' })).toBeEnabled());
    await user.click(stepper.getByRole('button', { name: 'Increase quantity' }));
    await waitFor(() => expect(db.carts[1][0].quantity).toBe(3));
  });
});

describe('gift assistant: starting over', () => {
  it('drops a reply still on its way to the abandoned conversation', async () => {
    server.use(http.post(`${API}/ai/assistant`, async () => {
      await delay(300);
      return undefined;
    }));
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Gift assistant/ }));
    const panel = screen.getByRole('dialog', { name: 'Gift assistant' });
    await user.type(within(panel).getByLabelText('Message the gift assistant'), 'A gift for my mom under ₹600');
    await user.click(within(panel).getByRole('button', { name: 'Send' }));
    await user.click(within(panel).getByRole('button', { name: 'Start over' }));
    await delay(500);
    expect(within(panel).queryByRole('list', { name: 'Suggested gifts' })).toBeNull();
    expect(within(panel).queryByText(/Looking through the shop/)).toBeNull();
    await user.type(within(panel).getByLabelText('Message the gift assistant'), 'hi');
    expect(within(panel).getByRole('button', { name: 'Send' })).toBeEnabled();
  });
});

describe('payment window script', () => {
  it('a load that brings no Razorpay can be tried again instead of failing forever', async () => {
    const { payWithRazorpay } = await import('../services/payment.js');
    const scripts = [];
    const append = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      scripts.push(node);
      return node;
    });
    try {
      const payment = { keyId: 'rzp_test_x', razorpayOrderId: 'order_x', amountPaise: 100, currency: 'INR' };
      const first = payWithRazorpay('GG-1', payment);
      scripts[0].onload(); // loaded, but no window.Razorpay (blocked or broken)
      await expect(first).rejects.toThrow(/Couldn't load the payment window/);

      const second = payWithRazorpay('GG-1', payment);
      expect(scripts).toHaveLength(2); // a fresh attempt, not the cached failure
      window.Razorpay = class {
        constructor(options) { this.options = options; }
        on() {}
        open() { this.options.handler({ razorpay_order_id: 'order_x', razorpay_payment_id: 'pay_x', razorpay_signature: 's' }); }
      };
      scripts[1].onload();
      await expect(second).resolves.toEqual({ razorpayOrderId: 'order_x', razorpayPaymentId: 'pay_x', razorpaySignature: 's' });
    } finally {
      append.mockRestore();
      delete window.Razorpay;
    }
  });
});

it('seedGuestCart lines still load (the format the app writes)', async () => {
  seedGuestCart([{ productId: 4, name: 'Signature Perfume', image: null, unitPrice: 1199, quantity: 2 }]);
  renderApp('/cart');
  expect(await screen.findByRole('group', { name: 'Quantity of Signature Perfume' })).toHaveTextContent('2');
});
