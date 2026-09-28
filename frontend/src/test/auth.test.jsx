import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { renderApp, seedGuestCart } from './renderApp.jsx';
import { db, server } from './setup.js';

describe('sign-in dialog modes', () => {
  it('names the dialog, form and heading after the current mode', async () => {
    const { user } = renderApp('/');
    const opener = screen.getByRole('button', { name: 'Sign in to your account' });
    await user.click(opener);

    let dialog = screen.getByRole('dialog', { name: 'Sign in' });
    expect(within(dialog).getByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
    expect(within(dialog).getByRole('form', { name: 'Sign in' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Welcome Back' })).toHaveAccessibleDescription('Sign in to your GiftGenius account');

    await user.click(within(dialog).getByRole('button', { name: 'Forgot password?' }));
    dialog = screen.getByRole('dialog', { name: 'Forgot password' });
    expect(screen.queryByRole('dialog', { name: 'Sign in' })).toBeNull();
    expect(within(dialog).getByRole('heading', { name: 'Forgot Password' })).toBeInTheDocument();
    expect(within(dialog).getByRole('form', { name: 'Forgot password' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close forgot password' })).toBeInTheDocument();
    const group = within(dialog).getByRole('group', { name: 'Forgot Password' });
    expect(group).toHaveAccessibleDescription("Enter your email and we'll send you a reset link");
    await waitFor(() => expect(within(dialog).getByLabelText('Email')).toHaveFocus());

    await user.type(within(dialog).getByLabelText('Email'), 'asha@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Send Reset Link →' }));
    expect(await within(dialog).findByRole('status')).toHaveTextContent(/If an account exists for asha@example.com/);

    await user.click(within(dialog).getByRole('button', { name: '← Back to sign in' }));
    dialog = screen.getByRole('dialog', { name: 'Sign in' });
    await user.click(within(dialog).getByRole('button', { name: 'Sign up free' }));
    dialog = screen.getByRole('dialog', { name: 'Create account' });
    expect(within(dialog).getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Create account' })).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const { user } = renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Sign in to your account' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign in' });
    const close = within(dialog).getByRole('button', { name: 'Close sign in' });
    const last = within(dialog).getByRole('button', { name: 'Sign up free' });
    // The dialog puts focus on the first field when it opens.
    await waitFor(() => expect(within(dialog).getByLabelText('Email')).toHaveFocus());

    close.focus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
  });

  it('signs in from the dialog after visiting forgot password', async () => {
    const { user } = renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Sign in to your account' }));
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.click(screen.getByRole('button', { name: '← Back to sign in' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign in' });
    await user.type(within(dialog).getByLabelText('Email'), 'asha@example.com');
    await user.type(within(dialog).getByLabelText('Password'), 'correct-horse');
    await user.click(within(dialog).getByRole('button', { name: 'Sign In →' }));
    expect(await screen.findByRole('button', { name: 'Account menu for Asha Rao' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Sign in' })).toBeNull();
  });
});

describe('forgot and reset password pages', () => {
  it('names each page after its mode', async () => {
    const { unmount } = renderApp('/forgot-password');
    expect(await screen.findByRole('heading', { level: 1, name: 'Forgot Password' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Forgot password' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Forgot Password · GiftGenius'));
    unmount();

    renderApp('/reset-password?token=reset-token-1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Reset Password' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Reset password' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Reset Password · GiftGenius'));
  });

  it('validates the new password, resets it once, and refuses the same link again', async () => {
    const { user, unmount } = renderApp('/reset-password?token=reset-token-1');
    const pw = await screen.findByLabelText('New password');
    const confirm = screen.getByLabelText('Confirm new password');
    expect(pw).toHaveAccessibleDescription('Choose a new password of at least 8 characters.');

    // Mismatch: caught before calling the server, and tied to the confirm field.
    await user.type(pw, 'brand-new-pass');
    await user.type(confirm, 'brand-new-pasS');
    await user.click(screen.getByRole('button', { name: 'Save New Password →' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The passwords do not match.');
    expect(confirm).toHaveAttribute('aria-invalid', 'true');
    expect(confirm).toHaveAccessibleDescription('The passwords do not match.');
    expect(db.resetToken).toBe('reset-token-1');

    // Too short: the server's field message is shown on the new-password field.
    await user.clear(pw);
    await user.clear(confirm);
    await user.type(pw, 'short');
    await user.type(confirm, 'short');
    await user.click(screen.getByRole('button', { name: 'Save New Password →' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Use 8 to 72 characters');
    expect(pw).toHaveAttribute('aria-invalid', 'true');
    expect(confirm).toHaveAttribute('aria-invalid', 'false');

    await user.clear(pw);
    await user.clear(confirm);
    await user.type(pw, 'brand-new-pass');
    await user.type(confirm, 'brand-new-pass');
    await user.click(screen.getByRole('button', { name: 'Save New Password →' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome Back' })).toBeInTheDocument();
    expect(screen.getByText('Password changed. Sign in with your new password. 🔐')).toBeInTheDocument();
    expect(db.users[0].password).toBe('brand-new-pass');
    unmount();

    // The link only works once.
    const again = renderApp('/reset-password?token=reset-token-1');
    await again.user.type(await screen.findByLabelText('New password'), 'another-pass-9');
    await again.user.type(screen.getByLabelText('Confirm new password'), 'another-pass-9');
    await again.user.click(screen.getByRole('button', { name: 'Save New Password →' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This reset link is invalid or has expired. Request a new one.');
    expect(db.users[0].password).toBe('brand-new-pass');
  });

  it('explains a missing reset link and offers a new one', async () => {
    renderApp('/reset-password');
    expect(await screen.findByRole('heading', { level: 1, name: 'Reset Link Missing' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a New Link →' })).toHaveAttribute('href', '/forgot-password');
  });
});

describe('sign-in and sign-up validation and errors', () => {
  const API = 'http://localhost/api';

  it('checks the sign-in form before calling the API', async () => {
    const { user } = renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Sign In →' }));
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAccessibleDescription('Enter your email address.');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.');
    await waitFor(() => expect(email).toHaveFocus());

    await user.type(email, 'asha@');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Sign In →' }));
    expect(email).toHaveAccessibleDescription('Enter a valid email address, like name@example.com.');
    expect(db.calls.filter((c) => c.url === '/api/auth/login')).toHaveLength(0);
  });

  it('shows a loading state, then a clear message for wrong credentials', async () => {
    server.use(http.post(`${API}/auth/login`, async () => {
      await delay(150);
      return HttpResponse.json({ status: 401, detail: 'Incorrect email or password.' }, { status: 401 });
    }));
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign In →' }));
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(screen.getByRole('button', { name: 'Sign In →' })).toBeEnabled();
  });

  it('never shows raw server errors, and explains network failures', async () => {
    server.use(http.post(`${API}/auth/login`, () => new HttpResponse('<html>java.lang.NullPointerException at com.giftgenius</html>',
      { status: 500, headers: { 'Content-Type': 'text/html' } })));
    const { user, unmount } = renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign In →' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Please try again.');
    expect(alert).not.toHaveTextContent(/Exception|html/);
    unmount();

    server.use(http.post(`${API}/auth/login`, () => HttpResponse.error()));
    const again = renderApp('/login');
    await again.user.type(await screen.findByLabelText('Email'), 'asha@example.com');
    await again.user.type(screen.getByLabelText('Password'), 'correct-horse');
    await again.user.click(screen.getByRole('button', { name: 'Sign In →' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't reach GiftGenius. Check your connection and try again.");
  });

  it('validates sign-up (name, email, password rules, matching confirmation) with accessible errors', async () => {
    const { user } = renderApp('/register');
    await user.click(await screen.findByRole('button', { name: 'Create Account →' }));
    expect(screen.getByLabelText('Full name')).toHaveAccessibleDescription('Enter your full name.');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter your email address.');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Choose a password. At least 8 characters.');
    expect(screen.getByLabelText('Confirm password')).toHaveAccessibleDescription('Re-enter your password.');

    await user.type(screen.getByLabelText('Full name'), 'Riya Mehta');
    await user.type(screen.getByLabelText('Email'), 'riya@example.com');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.type(screen.getByLabelText('Confirm password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create Account →' }));
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Use at least 8 characters. At least 8 characters.');

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'gift-lover-2026');
    await user.clear(screen.getByLabelText('Confirm password'));
    await user.type(screen.getByLabelText('Confirm password'), 'gift-lover-2025');
    await user.click(screen.getByRole('button', { name: 'Create Account →' }));
    expect(screen.getByLabelText('Confirm password')).toHaveAccessibleDescription("The passwords don't match.");
    expect(db.calls.filter((c) => c.url === '/api/auth/register')).toHaveLength(0);
  });

  it('creates a customer account and confirms it', async () => {
    const { user } = renderApp('/register');
    await user.type(await screen.findByLabelText('Full name'), 'Riya Mehta');
    await user.type(screen.getByLabelText('Email'), 'riya@example.com');
    await user.type(screen.getByLabelText('Password'), 'gift-lover-2026');
    await user.type(screen.getByLabelText('Confirm password'), 'gift-lover-2026');
    await user.click(screen.getByRole('button', { name: 'Create Account →' }));

    expect(await screen.findByText('Account created. Welcome to GiftGenius, Riya! 🎁')).toBeInTheDocument();
    expect(db.users.find((u) => u.email === 'riya@example.com').role).toBe('CUSTOMER');
    await user.click(screen.getByRole('button', { name: 'Account menu for Riya Mehta' }));
    expect(screen.queryByRole('menuitem', { name: /Store Admin/ })).toBeNull();
  });

  it('shows the server message when the email is already registered', async () => {
    const { user } = renderApp('/register');
    await user.type(await screen.findByLabelText('Full name'), 'Asha Again');
    await user.type(screen.getByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText('Password'), 'gift-lover-2026');
    await user.type(screen.getByLabelText('Confirm password'), 'gift-lover-2026');
    await user.click(screen.getByRole('button', { name: 'Create Account →' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists. Sign in instead.');
  });
});

describe('checkout sign-in prompt for guests', () => {
  it('explains why, keeps the cart, and continues to checkout after signing in', async () => {
    seedGuestCart([{ productId: 4, name: 'Signature Perfume', image: null, unitPrice: 1199, quantity: 1 }]);
    const { user } = renderApp('/cart');
    await user.click(await screen.findByRole('button', { name: 'Sign in to Checkout →' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign in' });
    expect(within(dialog).getByText('Sign in to check out. Your cart is saved and moves to your account.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Email'), 'asha@example.com');
    await user.type(within(dialog).getByLabelText('Password'), 'correct-horse');
    await user.click(within(dialog).getByRole('button', { name: 'Sign In →' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Delivery Details 📦' })).toBeInTheDocument();
    await waitFor(() => expect(db.carts[1]).toEqual([expect.objectContaining({ productId: 4, quantity: 1 })]));
  });
});
