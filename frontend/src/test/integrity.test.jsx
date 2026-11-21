import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { renderApp, seedGuestCart } from './renderApp.jsx';
import { db } from './setup.js';
import { MERGE_KEY, mergeKeyFor } from '../context/CartContext.jsx';
import { ConfirmationEmailNote } from '../pages/orders/OrderDetail.jsx';
import { stockNote } from '../pages/admin/ProductForm.jsx';

async function signIn(user) {
  await user.type(await screen.findByLabelText('Email'), 'asha@example.com');
  await user.type(screen.getByLabelText('Password'), 'correct-horse');
  await user.click(screen.getByRole('button', { name: 'Sign In →' }));
}

async function placeCodOrder() {
  seedGuestCart([{ productId: 4, name: 'Signature Perfume', image: null, unitPrice: 1199, quantity: 1 }]);
  const { user } = renderApp('/login?next=%2Fcheckout');
  await signIn(user);
  await user.type(await screen.findByLabelText('Phone'), '+91 98765 43210');
  await user.type(screen.getByLabelText('Address'), '12 MG Road');
  await user.type(screen.getByLabelText('City'), 'Pune');
  await user.selectOptions(screen.getByLabelText('State'), 'Maharashtra');
  await user.type(screen.getByLabelText('Pincode'), '411001');
  await user.click(await screen.findByRole('button', { name: /Place Order · ₹1,199/ }));
  await screen.findByRole('heading', { name: 'Order Placed Successfully!' });
}

describe('order confirmation email wording (GG-53)', () => {
  it.each([
    ['SENT', /We’ve sent a confirmation to asha@example\.com/],
    ['SENDING', /We’re sending a confirmation to asha@example\.com/],
    ['FAILED', /couldn’t send the confirmation email to asha@example\.com/],
    ['NOT_SENT', /doesn’t send confirmation emails yet, so none was sent/],
    [null, /^Your order’s details are here and in My Orders\.$/],
  ])('says only what the server knows: %s', (status, wording) => {
    render(<ConfirmationEmailNote status={status} email="asha@example.com" />);
    const note = screen.getByText((_, el) => el?.tagName === 'P' && wording.test(el.textContent.replace(/'/g, '’')));
    expect(note).toBeInTheDocument();
    if (status !== 'SENT') expect(note.textContent).not.toMatch(/sent a confirmation|emailed/);
  });

  it('after checkout without an email provider, the page doesn’t claim an email was sent', async () => {
    await placeCodOrder();
    expect(screen.getByText(/doesn.t send confirmation emails yet/)).toBeInTheDocument();
    expect(screen.queryByText(/emailed a confirmation|sent a confirmation/)).toBeNull();
  });

  it('after checkout with the email accepted by the mail server, it says it was sent', async () => {
    db.confirmationEmail = 'SENT';
    await placeCodOrder();
    expect(screen.getByText(/sent a confirmation to/)).toBeInTheDocument();
  });
});

describe('guest cart merge at sign-in is safe to retry (GG-45)', () => {
  it('a merge whose reply was lost is retried with the same key and adds the lines once', async () => {
    seedGuestCart([{ productId: 4, name: 'Signature Perfume', image: null, unitPrice: 1199, quantity: 2 }]);
    db.loseMergeResponse = true; // the server applies the merge, but the reply never arrives
    const first = renderApp('/login');
    await signIn(first.user);
    await waitFor(() => expect(db.mergeCalls).toBe(1));
    const savedKey = JSON.parse(localStorage.getItem(MERGE_KEY)).key;
    expect(JSON.parse(localStorage.getItem('gg-cart'))).toHaveLength(1); // kept for the retry
    first.unmount();

    renderApp('/cart'); // the shopper reloads: still signed in, the guest cart is merged again
    await waitFor(() => expect(db.mergeCalls).toBe(2));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('gg-cart'))).toEqual([]));
    expect(localStorage.getItem(MERGE_KEY)).toBeNull();
    const line = db.carts[1].find((l) => l.productId === 4);
    expect(line.quantity).toBe(2); // not 4
    expect(savedKey).toMatch(/\S{8,}/);
  });

  it('makes the merge key as soon as a guest cart is saved, so every tab merges under the same one', async () => {
    seedGuestCart([{ productId: 4, name: 'Signature Perfume', image: null, unitPrice: 1199, quantity: 1 }]);
    renderApp('/cart');
    await waitFor(() => expect(localStorage.getItem(MERGE_KEY)).not.toBeNull());
    const saved = JSON.parse(localStorage.getItem(MERGE_KEY));
    expect(mergeKeyFor([{ productId: 4, quantity: 1, customName: null, customMessage: null }])).toBe(saved.key);
  });

  it('keeps the key while the guest cart is unchanged and makes a new one when it changes', () => {
    const lines = [{ productId: 4, quantity: 1, customName: null, customMessage: null }];
    const a = mergeKeyFor(lines);
    expect(mergeKeyFor(lines)).toBe(a);
    expect(mergeKeyFor([{ ...lines[0], quantity: 2 }])).not.toBe(a);
  });
});

describe('stock saved from an edit form (GG-36)', () => {
  it('says when orders came in while the form was open', () => {
    expect(stockNote({ stock: 58 }, 60)).toBe('Saved ✓ Stock is 58: 2 sold while you were editing.');
    expect(stockNote({ stock: 60 }, 60)).toBeNull();
    expect(stockNote(undefined, 60)).toBeNull();
  });
});
