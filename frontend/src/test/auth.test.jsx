import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderApp } from './renderApp.jsx';
import { db } from './setup.js';

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
