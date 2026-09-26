import { describe, expect, it } from 'vitest';
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

  it('shows the server message for a wrong password', async () => {
    const { user } = renderApp('/login');
    await signIn(user, 'asha@example.com', 'nope');
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
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
