import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderApp, seedGuestCart } from './renderApp.jsx';
import { db } from './setup.js';

async function signIn(user, email = 'asha@example.com', password = 'correct-horse') {
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign In →' }));
}

async function fillAddress(user) {
  await user.type(await screen.findByLabelText('Phone'), '+91 98765 43210');
  await user.type(screen.getByLabelText('Address'), '12 MG Road');
  await user.type(screen.getByLabelText('City'), 'Pune');
  await user.selectOptions(screen.getByLabelText('State'), 'Maharashtra');
  await user.type(screen.getByLabelText('Pincode'), '411001');
}

describe('product page', () => {
  it('follows the original layout and personalises with an AI card message', async () => {
    const { user } = renderApp('/product/1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Luxury Hamper Box' })).toBeInTheDocument();
    expect(screen.getByText('29% OFF')).toBeInTheDocument();
    expect(screen.getByText('✓ In Stock')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Description' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: /Help me write the message/ }));
    await user.click(screen.getByRole('button', { name: '✨ Suggest messages' }));
    await user.click(await screen.findByRole('button', { name: 'Love you always.' }));
    expect(screen.getByLabelText('Gift card message')).toHaveValue('Love you always.');

    await user.click(screen.getByRole('button', { name: 'Increase quantity' }));
    await user.click(screen.getByRole('button', { name: '🛒 Add to Cart' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('gg-cart'))).toMatchObject([
      { productId: 1, quantity: 2, customMessage: 'Love you always.' },
    ]));
    expect(screen.getByRole('dialog', { name: 'Shopping cart' })).not.toHaveAttribute('hidden');

    await user.click(screen.getByRole('tab', { name: 'Delivery & Returns' }));
    expect(screen.getByText(/Free until your gift ships/)).toBeInTheDocument();
  });

  it('shows a friendly 404 for unknown gifts', async () => {
    renderApp('/product/999');
    expect(await screen.findByRole('heading', { name: "We couldn't find that gift" })).toBeInTheDocument();
  });
});

describe('cart, sign-in and checkout', () => {
  it('prices the cart on the server with a coupon, and asks guests to sign in', async () => {
    seedGuestCart([{ productId: 4, name: 'Signature Perfume', image: null, unitPrice: 1199, quantity: 2 }]);
    const { user } = renderApp('/cart');
    expect(await screen.findByRole('heading', { name: /Your Cart/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Checkout progress' })).toHaveTextContent(/1\s*Cart/);
    await user.type(screen.getByLabelText('🎟️ Apply Coupon Code'), 'welcome');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(/WELCOME applied: you save ₹100/)).toBeInTheDocument();
    expect(screen.getByText('₹2,298')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in to Checkout →' }));
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows a clear message for a wrong password', async () => {
    const { user } = renderApp('/login');
    await signIn(user, 'asha@example.com', 'nope');
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('signs in from the header 👤 modal and merges the guest cart and wishlist exactly once', async () => {
    seedGuestCart([{ productId: 6, name: 'Artisan Chocolate Box', image: null, unitPrice: 299, quantity: 2 }]);
    localStorage.setItem('gg-wishlist', JSON.stringify([{ id: 3, name: 'Classic Rose Bouquet', price: 599 }]));
    const { user } = renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Sign in to your account' }));
    const modal = screen.getByRole('dialog', { name: 'Sign in' });
    await user.type(within(modal).getByLabelText('Email'), 'asha@example.com');
    await user.type(within(modal).getByLabelText('Password'), 'correct-horse');
    await user.click(within(modal).getByRole('button', { name: 'Sign In →' }));

    expect(await screen.findByRole('button', { name: 'Account menu for Asha Rao' })).toBeInTheDocument();
    await waitFor(() => expect(db.carts[1]).toEqual([expect.objectContaining({ productId: 6, quantity: 2 })]));
    expect(db.wishlists[1]).toEqual([3]);
    expect(db.calls.filter((c) => c.url === '/api/cart/merge')).toHaveLength(1);
  });

  it('never redirects to another site after sign-in', async () => {
    const { user } = renderApp('/login?next=%2F%2Fevil.example');
    await signIn(user);
    expect(await screen.findByRole('heading', { level: 1, name: /Find the Perfect Gift/ })).toBeInTheDocument();
  });

  it('places a COD order with an idempotency key and shows the original success screen', async () => {
    seedGuestCart([{ productId: 4, name: 'Signature Perfume', image: null, unitPrice: 1199, quantity: 1 }]);
    const { user } = renderApp('/login?next=%2Fcheckout');
    await signIn(user);
    expect(await screen.findByRole('heading', { name: 'Delivery Details 📦' })).toBeInTheDocument();
    expect(screen.getByLabelText('First Name')).toHaveValue('Asha');
    expect(screen.getByLabelText('Last Name')).toHaveValue('Rao');
    await fillAddress(user);
    await user.click(await screen.findByRole('button', { name: /Place Order · ₹1,199/ }));

    expect(await screen.findByRole('heading', { name: 'Order Placed Successfully!' })).toBeInTheDocument();
    expect(screen.getByText('Order ID: GG-TEST0001')).toBeInTheDocument();
    expect(screen.getByText('💰 Pay on delivery')).toBeInTheDocument();
    const call = db.calls.find((c) => c.method === 'POST' && c.url === '/api/orders');
    expect(call.headers.get('Idempotency-Key')).toMatch(/^[\w-]{10,64}$/);
    await waitFor(() => expect(screen.getByTestId('cart-count')).toHaveTextContent('0'));
  });

  it('reuses the idempotency key when a network error interrupts the first attempt', async () => {
    seedGuestCart([{ productId: 1, name: 'Luxury Hamper Box', image: null, unitPrice: 499, quantity: 1 }]);
    const { user } = renderApp('/login?next=%2Fcheckout');
    await signIn(user);
    await fillAddress(user);
    db.failNextOrder = true;
    await user.click(await screen.findByRole('button', { name: /Place Order/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't reach");

    await user.click(screen.getByRole('button', { name: /Place Order/ }));
    expect(await screen.findByRole('heading', { name: 'Order Placed Successfully!' })).toBeInTheDocument();
    const keys = db.calls.filter((c) => c.method === 'POST' && c.url === '/api/orders').map((c) => c.headers.get('Idempotency-Key'));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(db.orders).toHaveLength(1);
  });
});

/**
 * Razorpay Checkout stand-in. `script` plays the shopper's part once the window opens, using
 * succeed/fail/close below; every window opened is recorded with the options it was given.
 */
function stubRazorpay(script) {
  const opened = [];
  window.Razorpay = class {
    constructor(options) {
      this.options = options;
      this.events = {};
      opened.push(this);
    }

    on(event, fn) {
      this.events[event] = fn;
    }

    open() {
      queueMicrotask(() => script(this));
    }
  };
  return opened;
}
const succeed = (rzp, paymentId = 'pay_1') => rzp.options.handler({
  razorpay_order_id: rzp.options.order_id, razorpay_payment_id: paymentId,
  razorpay_signature: `sig_${rzp.options.order_id}|${paymentId}`,
});
const fail = (rzp, description) => rzp.events['payment.failed']({ error: { description } });
const close = (rzp) => rzp.options.modal.ondismiss();
const toastText = () => document.getElementById('toast').textContent;
const verifyCalls = () => db.calls.filter((c) => c.method === 'POST' && c.url === '/api/orders/GG-TEST0001/payment/verify');

describe('online payment (Razorpay test mode)', () => {
  afterEach(() => {
    delete window.Razorpay;
  });

  async function toPayment() {
    db.onlinePayment = true;
    seedGuestCart([{ productId: 4, name: 'Signature Perfume', image: null, unitPrice: 1199, quantity: 1 }]);
    const { user } = renderApp('/login?next=%2Fcheckout');
    await signIn(user);
    await fillAddress(user);
    return user;
  }

  it('pays by UPI and is confirmed only by the server', async () => {
    const opened = stubRazorpay((rzp) => succeed(rzp));
    const user = await toPayment();
    // UPI is preselected once the options say online payment is on.
    await waitFor(() => expect(screen.getByRole('radio', { name: /UPI/ })).toBeChecked());
    await user.click(screen.getByRole('button', { name: /Pay ₹1,199/ }));

    expect(await screen.findByRole('heading', { name: 'Order Placed Successfully!' })).toBeInTheDocument();
    expect(opened).toHaveLength(1);
    expect(opened[0].options).toMatchObject({
      key: 'rzp_test_mock', order_id: 'order_GG-TEST0001', amount: 119900, currency: 'INR',
      prefill: { method: 'upi', email: 'asha@example.com', contact: '+91 98765 43210' },
    });
    expect(JSON.stringify(opened[0].options)).not.toMatch(/secret/i);
    expect(verifyCalls()).toHaveLength(1);
    expect(db.orders[0].dto).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(screen.getByText('Paid')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('cart-count')).toHaveTextContent('0'));
  });

  it('keeps the window open after a failed attempt so a retry still confirms the order', async () => {
    const opened = stubRazorpay((rzp) => {
      fail(rzp, 'Payment failed because the UPI request timed out.');
      succeed(rzp, 'pay_retry');
    });
    const user = await toPayment();
    await user.click(screen.getByRole('radio', { name: /Net Banking/ }));
    await user.click(screen.getByRole('button', { name: /Pay ₹1,199/ }));

    expect(await screen.findByRole('heading', { name: 'Order Placed Successfully!' })).toBeInTheDocument();
    expect(opened[0].options.prefill.method).toBe('netbanking');
    expect(db.orders[0].dto.paymentStatus).toBe('PAID');
  });

  it('leaves a failed, closed payment unpaid and payable later from the order page', async () => {
    let script = (rzp) => {
      fail(rzp, 'Your bank declined this payment');
      close(rzp);
    };
    stubRazorpay((rzp) => script(rzp));
    const user = await toPayment();
    await user.click(screen.getByRole('button', { name: /Pay ₹1,199/ }));

    await waitFor(() => expect(toastText()).toContain('Your bank declined this payment. Your order is saved'));
    const payNow = await screen.findByRole('button', { name: 'Pay ₹1,199 now →' });
    expect(screen.getByText('Complete payment within 30 minutes to confirm this order.')).toBeInTheDocument();
    expect(verifyCalls()).toHaveLength(0);
    expect(db.orders[0].dto.status).toBe('PENDING_PAYMENT');
    expect(screen.getByTestId('cart-count')).toHaveTextContent('1'); // the basket survives an unpaid order

    script = (rzp) => succeed(rzp, 'pay_later');
    await user.click(payNow);
    await waitFor(() => expect(toastText()).toContain('Payment received. Thank you!'));
    expect(db.orders[0].dto.paymentStatus).toBe('PAID');
    await waitFor(() => expect(screen.queryByRole('button', { name: /now →/ })).not.toBeInTheDocument());
  });

  it('never trusts a payment result the server cannot verify', async () => {
    stubRazorpay((rzp) => rzp.options.handler({
      razorpay_order_id: rzp.options.order_id, razorpay_payment_id: 'pay_forged', razorpay_signature: 'forged',
    }));
    const user = await toPayment();
    await user.click(screen.getByRole('button', { name: /Pay ₹1,199/ }));

    await waitFor(() => expect(toastText()).toContain("We couldn't verify this payment"));
    expect(await screen.findByRole('button', { name: 'Pay ₹1,199 now →' })).toBeInTheDocument();
    expect(db.orders[0].dto).toMatchObject({ status: 'PENDING_PAYMENT', paymentStatus: 'PENDING' });
  });

  it('rides out a dropped connection while confirming the payment', async () => {
    db.verifyOutages = 1;
    stubRazorpay((rzp) => succeed(rzp));
    const user = await toPayment();
    await user.click(screen.getByRole('button', { name: /Pay ₹1,199/ }));

    expect(await screen.findByRole('heading', { name: 'Order Placed Successfully!' }, { timeout: 8000 })).toBeInTheDocument();
    expect(verifyCalls()).toHaveLength(2);
  });

  it('reassures the shopper when the server stays unreachable after Razorpay took the payment', async () => {
    db.verifyOutages = 3;
    stubRazorpay((rzp) => succeed(rzp));
    const user = await toPayment();
    await user.click(screen.getByRole('button', { name: /Pay ₹1,199/ }));

    await waitFor(() => expect(toastText()).toContain("Razorpay has your payment. We're confirming it"), { timeout: 10_000 });
    expect(verifyCalls()).toHaveLength(3);
    // No blank screen: the order page shows the order, which the webhook will confirm.
    expect(await screen.findByText('GG-TEST0001')).toBeInTheDocument();
  });
});
