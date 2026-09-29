import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp, seedGuestCart } from './renderApp.jsx';
import { db } from './setup.js';

const welcome = () => screen.queryByRole('dialog', { name: 'Welcome to GiftGenius' });
const authCalls = () => db.calls.filter((c) => c.url.startsWith('/api/auth/') && c.url !== '/api/auth/refresh');

describe('first visit: entry animation → welcome screen', () => {
  beforeEach(() => {
    sessionStorage.removeItem('gg-welcome-answered');
  });

  it('plays the entry animation, then offers Log In, Sign Up or continuing without an account', async () => {
    sessionStorage.removeItem('gg-entry-shown');
    const { user } = renderApp('/');
    const intro = screen.getByRole('dialog', { name: 'GiftGenius intro' });
    expect(within(intro).getByRole('button', { name: 'Open the gift to enter GiftGenius' })).toHaveFocus();
    expect(welcome()).toBeNull();

    await act(async () => { fireEvent.keyDown(document, { key: 'Enter' }); });
    expect(document.querySelectorAll('.confetti-piece').length).toBe(80);

    const dialog = await screen.findByRole('dialog', { name: 'Welcome to GiftGenius' }, { timeout: 5000 });
    expect(dialog).toHaveAccessibleDescription(/Find thoughtful gifts, discover curated collections/);
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Welcome to GiftGenius' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Log In' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Continue without an account' })).toBeInTheDocument();
    // Focus starts on the heading, so the Enter used to open the gift can't start signing in by accident.
    const heading = within(dialog).getByRole('heading', { name: 'Welcome to GiftGenius' });
    await waitFor(() => expect(heading).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(welcome()).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Sign in' })).toBeNull();
    expect(sessionStorage.getItem('gg-welcome-answered')).toBeNull();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Log In' })).toHaveFocus();
  });

  describe('with reduced motion', () => {
    beforeEach(() => {
      window.matchMedia = vi.fn().mockImplementation((q) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    });
    afterEach(() => {
      delete window.matchMedia;
    });

    it('opens the gift without confetti or fireworks and moves on quickly', async () => {
      sessionStorage.removeItem('gg-entry-shown');
      renderApp('/');
      await act(async () => { fireEvent.keyDown(document, { key: 'Enter' }); });
      expect(document.querySelectorAll('.confetti-piece').length).toBe(0);
      expect(await screen.findByRole('dialog', { name: 'Welcome to GiftGenius' }, { timeout: 1500 })).toBeInTheDocument();
      expect(document.querySelectorAll('.firework-burst').length).toBe(0);
    });
  });

  it('continues without an account: no backend account, guest cart kept, and not asked again', async () => {
    seedGuestCart([{ productId: 6, name: 'Artisan Chocolate Box', image: null, unitPrice: 299, quantity: 2 }]);
    localStorage.setItem('gg-wishlist', JSON.stringify([{ id: 3, name: 'Classic Rose Bouquet', price: 599 }]));
    const { user, unmount } = renderApp('/');
    const dialog = await screen.findByRole('dialog', { name: 'Welcome to GiftGenius' });
    await user.click(within(dialog).getByRole('button', { name: 'Continue without an account' }));

    expect(welcome()).toBeNull();
    await waitFor(() => expect(document.getElementById('main-content')).toHaveFocus());
    expect(localStorage.getItem('gg-guest')).toBe('1');
    expect(authCalls()).toEqual([]);
    expect(screen.getByTestId('cart-count')).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'My wishlist, 1 items' })).toBeInTheDocument();

    // Guests can shop: product → cart, all local.
    await user.click(await screen.findByRole('button', { name: 'Add Signature Perfume to cart' }));
    expect(screen.getByTestId('cart-count')).toHaveTextContent('3');
    expect(JSON.parse(localStorage.getItem('gg-cart'))).toHaveLength(2);
    unmount();

    // A returning guest goes straight to the shop, even in a new browser session.
    sessionStorage.clear();
    sessionStorage.setItem('gg-entry-shown', '1');
    renderApp('/');
    await screen.findByRole('heading', { name: 'Luxury Hamper Box' });
    expect(welcome()).toBeNull();
  });

  it('Log In opens the sign-in dialog and keeps the guest cart through sign-in', async () => {
    seedGuestCart([{ productId: 4, name: 'Signature Perfume', image: null, unitPrice: 1199, quantity: 1 }]);
    const { user } = renderApp('/');
    const dialog = await screen.findByRole('dialog', { name: 'Welcome to GiftGenius' });
    await user.click(within(dialog).getByRole('button', { name: 'Log In' }));

    expect(welcome()).toBeNull();
    const signIn = screen.getByRole('dialog', { name: 'Sign in' });
    await user.type(within(signIn).getByLabelText('Email'), 'asha@example.com');
    await user.type(within(signIn).getByLabelText('Password'), 'correct-horse');
    await user.click(within(signIn).getByRole('button', { name: 'Sign In →' }));

    expect(await screen.findByRole('button', { name: 'Account menu for Asha Rao' })).toBeInTheDocument();
    expect(screen.getByText('Welcome back, Asha! 🎁')).toBeInTheDocument();
    await waitFor(() => expect(db.carts[1]).toEqual([expect.objectContaining({ productId: 4, quantity: 1 })]));
    expect(welcome()).toBeNull();
  });

  it('Sign Up opens account creation', async () => {
    const { user } = renderApp('/');
    const dialog = await screen.findByRole('dialog', { name: 'Welcome to GiftGenius' });
    await user.click(within(dialog).getByRole('button', { name: 'Sign Up' }));
    expect(screen.getByRole('dialog', { name: 'Create account' })).toBeInTheDocument();
    expect(sessionStorage.getItem('gg-welcome-answered')).toBe('1');
  });

  it('Escape closes it for this visit only', async () => {
    const { user } = renderApp('/');
    await screen.findByRole('dialog', { name: 'Welcome to GiftGenius' });
    await user.keyboard('{Escape}');
    expect(welcome()).toBeNull();
    expect(sessionStorage.getItem('gg-welcome-answered')).toBe('1');
    expect(localStorage.getItem('gg-guest')).toBeNull();
  });

  it('is not shown to signed-in shoppers', async () => {
    db.cookieUser = 1;
    localStorage.setItem('gg-session', '1');
    renderApp('/');
    expect(await screen.findByRole('button', { name: 'Account menu for Asha Rao' })).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Luxury Hamper Box' });
    expect(welcome()).toBeNull();
  });

  it('does not block public pages opened directly', async () => {
    renderApp('/product/1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Luxury Hamper Box' })).toBeInTheDocument();
    expect(welcome()).toBeNull();
  });
});
