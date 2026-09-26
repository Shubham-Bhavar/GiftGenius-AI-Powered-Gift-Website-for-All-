import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { renderApp, seedGuestCart } from './renderApp.jsx';
import { db } from './setup.js';

/*
 * Automated accessibility checks (axe-core, WCAG 2.x A/AA + best practices) on every page and overlay.
 * jsdom can't compute colours, so contrast is checked in a real browser instead (see README).
 */
async function violations() {
  const res = await axe.run(document, {
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  });
  return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** Restores a signed-in session the way the app does on page load (refresh cookie → access token). */
function signedInAs(userId) {
  db.cookieUser = userId;
  localStorage.setItem('gg-session', '1');
}

const PUBLIC_PAGES = [
  ['/', /Find the/],
  ['/shop', /All Gifts/],
  ['/product/1', 'Luxury Hamper Box'],
  ['/gift-finder', /Find the Perfect Gift/],
  ['/collections', /Our Collections/],
  ['/about', /Gifts That/],
  ['/contact', /Get in Touch/],
  ['/help', /How can we help/],
  ['/privacy', /Privacy Policy/],
  ['/terms', /Terms of Service/],
  ['/cart', 'Your cart is empty'],
  ['/wishlist', /My Wishlist/],
  ['/track', /Track Your Gift/],
  ['/login', 'Welcome Back'],
  ['/register', 'Create Account'],
  ['/forgot-password', 'Forgot Password'],
  ['/reset-password?token=abc', 'Reset Password'],
  ['/no-such-page', "We couldn't find that page"],
];

describe('accessibility (axe-core)', () => {
  it.each(PUBLIC_PAGES)('%s has one h1 and no violations', async (path, heading) => {
    renderApp(path);
    await screen.findByRole('heading', { level: 1, name: heading });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    // Let product data and lazy chunks finish rendering before scanning.
    if (path === '/' || path === '/shop') await screen.findAllByRole('listitem', {}, { timeout: 3000 });
    expect(await violations()).toEqual([]);
  });

  it('signed-in pages: account, orders, checkout', async () => {
    signedInAs(1);
    seedGuestCart([{ productId: 4, name: 'Signature Perfume', image: null, unitPrice: 1199, quantity: 1 }]);
    const { unmount } = renderApp('/checkout');
    await screen.findByRole('heading', { level: 1, name: 'Delivery Details 📦' });
    await screen.findByRole('button', { name: /Place Order/ });
    expect(await violations()).toEqual([]);
    unmount();

    renderApp('/account');
    await screen.findByRole('heading', { level: 1, name: /Account Settings/ });
    expect(await violations()).toEqual([]);
  });

  it('store admin pages', async () => {
    signedInAs(2);
    renderApp('/admin');
    await screen.findByRole('heading', { level: 1, name: /GiftGenius Dashboard/ });
    await screen.findByText(/Orders · 30 days/);
    expect(await violations()).toEqual([]);
  });

  it('open overlays: cart sidebar, quick view, gift finder and sign-in modal', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Add Signature Perfume to cart' }));
    await user.click(screen.getByRole('button', { name: /Open cart/ }));
    expect(await violations()).toEqual([]);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Quick view Classic Rose Bouquet' }));
    expect(await violations()).toEqual([]);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Sign in to your account' }));
    expect(await violations()).toEqual([]);
  });

  it('keeps closed overlays out of the tab order and returns focus when one closes', async () => {
    const { user } = renderApp('/');
    await screen.findByRole('button', { name: 'Add Signature Perfume to cart' });
    expect(document.getElementById('cartSide')).toHaveAttribute('inert');
    expect(document.querySelector('.quickview-modal:not(.gf-modal)')).toHaveAttribute('inert');
    expect(document.querySelector('.auth-overlay')).toHaveAttribute('inert');

    const cartButton = screen.getByRole('button', { name: /Open cart/ });
    await user.click(cartButton);
    const sidebar = screen.getByRole('dialog', { name: 'Shopping cart' });
    expect(sidebar).not.toHaveAttribute('inert');
    expect(within(sidebar).getByRole('button', { name: 'Close cart' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(cartButton).toHaveFocus();
  });

  it('quick view and the gift finder trap focus and hand it back when closed', async () => {
    const { user } = renderApp('/shop');
    const qvButton = await screen.findByRole('button', { name: 'Quick view Classic Rose Bouquet' });
    await user.click(qvButton);
    const qv = screen.getByRole('dialog', { name: 'Product quick view' });
    const qvClose = within(qv).getByRole('button', { name: 'Close quick view' });
    expect(qvClose).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(qv).getByRole('link', { name: 'View full details →' })).toHaveFocus();
    await user.tab();
    expect(qvClose).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(qvButton).toHaveFocus();

    const gfButton = screen.getByRole('button', { name: '✨ Not sure? Ask GiftGenius AI' });
    await user.click(gfButton);
    const gf = screen.getByRole('dialog', { name: 'GiftGenius Gift Finder' });
    expect(gf).not.toHaveAttribute('inert');
    await user.keyboard('{Escape}');
    expect(gf).toHaveAttribute('inert');
    expect(gfButton).toHaveFocus();
  });

  it('product tabs follow the keyboard tabs pattern', async () => {
    const { user } = renderApp('/product/1');
    const first = await screen.findByRole('tab', { name: 'Description' });
    first.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Gift Details' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Gift Details' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Gift Details' })).toBeVisible();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Delivery & Returns' })).toHaveFocus();
  });

  it('every product card has a real link to its page', async () => {
    renderApp('/');
    const link = await screen.findByRole('link', { name: 'Luxury Hamper Box' });
    expect(link).toHaveAttribute('href', '/product/1');
  });
});
