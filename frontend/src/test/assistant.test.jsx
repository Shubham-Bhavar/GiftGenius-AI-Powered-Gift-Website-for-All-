import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { renderApp } from './renderApp.jsx';
import { db } from './setup.js';
import { MAX_TURNS } from '../components/ai/GiftAssistant.jsx';

const launcher = () => screen.getByRole('button', { name: /Gift assistant|Close assistant/ });
const panel = () => screen.getByRole('dialog', { name: 'Gift assistant' });
const input = () => within(panel()).getByLabelText('Message the gift assistant');

async function openAssistant(path = '/') {
  const utils = renderApp(path);
  await utils.user.click(await screen.findByRole('button', { name: /Gift assistant/ }));
  return utils;
}

async function say(user, text) {
  await user.type(input(), text);
  await user.click(within(panel()).getByRole('button', { name: 'Send' }));
}

describe('gift assistant', () => {
  it('opens as a labelled, non-modal panel with focus in the message box, and Escape returns focus', async () => {
    const { user } = await openAssistant();
    expect(launcher()).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).toHaveAttribute('aria-modal', 'false');
    expect(input()).toHaveFocus();
    expect(within(panel()).getByText(/I never add to your cart or place an order/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Gift assistant' })).toBeNull();
    expect(launcher()).toHaveFocus();
    expect(launcher()).toHaveAttribute('aria-expanded', 'false');
  });

  it('stays out of the way while paying and in the back offices, and is there on shop pages', async () => {
    db.cookieUser = 1;
    localStorage.setItem('gg-session', '1');
    db.carts[1] = [{ id: 94, productId: 4, quantity: 1, customName: null, customMessage: null }];
    const { unmount } = renderApp('/checkout');
    await screen.findByRole('button', { name: /Place Order|Updating the total/ });
    expect(screen.queryByRole('button', { name: /Gift assistant/ })).toBeNull();
    unmount();

    const admin = renderApp('/admin');
    await screen.findByText(/Admins only/);
    expect(screen.queryByRole('button', { name: /Gift assistant/ })).toBeNull();
    admin.unmount();

    const seller = renderApp('/seller');
    await screen.findByText(/Sellers only/);
    expect(screen.queryByRole('button', { name: /Gift assistant/ })).toBeNull();
    seller.unmount();

    renderApp('/cart'); // the control: the same check finds it where it belongs
    expect(await screen.findByRole('button', { name: /Gift assistant/ })).toBeInTheDocument();
  });

  it('asks a question when there is nothing to go on, and suggests nothing', async () => {
    const { user } = await openAssistant();
    await say(user, 'hi');
    const log = within(within(panel()).getByRole('log'));
    expect(await log.findAllByText(/Who is the gift for/)).toHaveLength(1); // the reply is the question: said once
    expect(within(panel()).queryByRole('list', { name: 'Suggested gifts' })).toBeNull();
  });

  it('answers with real products that link to their pages, asks a follow-up, and remembers the conversation', async () => {
    const { user } = await openAssistant();
    await say(user, 'A gift for my mom under ₹600');
    const picks = await within(panel()).findByRole('list', { name: 'Suggested gifts' });
    const names = within(picks).getAllByRole('link').map((a) => a.textContent);
    expect(names).toEqual(['Luxury Hamper Box', 'Classic Rose Bouquet', 'Artisan Chocolate Box']);
    expect(within(picks).getByRole('link', { name: 'Classic Rose Bouquet' })).toHaveAttribute('href', '/product/3');
    expect(within(picks).getByText('₹599')).toBeInTheDocument();
    expect(within(picks).getByText('Reason 1 for Luxury Hamper Box.')).toBeInTheDocument();
    expect(within(panel()).getByText(/What’s the occasion\?/)).toBeInTheDocument();
    expect(db.assistantCalls).toEqual([['A gift for my mom under ₹600']]);

    await say(user, "It's for her birthday");
    await waitFor(() => expect(db.assistantCalls).toHaveLength(2));
    expect(db.assistantCalls[1]).toEqual(['A gift for my mom under ₹600', "It's for her birthday"]);
    expect(within(panel()).getAllByText('You said:', { exact: false })).toHaveLength(2);
  });

  it('compares up to three suggestions side by side, from what the catalogue says', async () => {
    const { user } = await openAssistant();
    await say(user, 'A gift for my mom under ₹600');
    const picks = await within(panel()).findByRole('list', { name: 'Suggested gifts' });
    const boxes = within(picks).getAllByRole('checkbox', { name: 'Compare' });
    await user.click(boxes[0]);
    expect(within(panel()).getByText('Tick one or two more to compare them.')).toBeInTheDocument();
    await user.click(boxes[2]);
    const table = within(within(panel()).getByRole('region', { name: 'Side by side' })).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent).slice(1))
      .toEqual(['Luxury Hamper Box', 'Artisan Chocolate Box']);
    expect(within(table).getByRole('row', { name: /Price/ })).toHaveTextContent('₹499₹299');
    await user.click(boxes[1]);
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
    await user.click(within(panel()).getByRole('button', { name: 'Clear' }));
    expect(within(panel()).queryByRole('region', { name: 'Side by side' })).toBeNull();
  });

  it('never adds to the cart or places an order', async () => {
    const { user } = await openAssistant();
    await say(user, 'Buy the hamper for my mom and place the order');
    await within(panel()).findByRole('list', { name: 'Suggested gifts' });
    expect(within(panel()).queryByRole('button', { name: /add to cart|buy|order/i })).toBeNull();
    expect(screen.getByTestId('cart-count')).toHaveTextContent('0');
    expect(db.calls.filter((c) => c.method === 'POST' && /\/(cart|orders)/.test(c.url))).toEqual([]);
  });

  it('says plainly when the shop can’t be reached, and can try again', async () => {
    db.assistantDown = true;
    const { user } = await openAssistant();
    await say(user, 'A gift for my dad');
    expect(await within(panel()).findByText('I couldn’t reach the shop just now.')).toBeInTheDocument();
    db.assistantDown = false;
    await user.click(within(panel()).getByRole('button', { name: 'Try again' }));
    expect(await within(panel()).findByRole('list', { name: 'Suggested gifts' })).toBeInTheDocument();
    expect(db.assistantCalls).toEqual([['A gift for my dad'], ['A gift for my dad']]);
  });

  it(`starts a new conversation after ${MAX_TURNS} messages, as the API reads no more`, async () => {
    const { user } = await openAssistant();
    for (let i = 0; i < MAX_TURNS; i++) {
      await say(user, `message ${i}`);
      await waitFor(() => expect(db.assistantCalls).toHaveLength(i + 1));
    }
    expect(within(panel()).queryByLabelText('Message the gift assistant')).toBeNull();
    await user.click(within(panel()).getByRole('button', { name: 'Start a new conversation' }));
    expect(input()).toHaveFocus();
    expect(within(panel()).queryByRole('list', { name: 'Suggested gifts' })).toBeNull();
  });

  it.each(['/checkout', '/admin', '/seller'])('stays out of the way on %s', async (path) => {
    renderApp(path);
    await new Promise((r) => { setTimeout(r, 50); });
    expect(screen.queryByRole('button', { name: /Gift assistant/ })).toBeNull();
  });

  it('has no accessibility violations, closed or in a conversation', async () => {
    const { user } = await openAssistant();
    await say(user, 'A gift for my mom under ₹600');
    await within(panel()).findByRole('list', { name: 'Suggested gifts' });
    await user.click(within(panel()).getAllByRole('checkbox', { name: 'Compare' })[0]);
    await user.click(within(panel()).getAllByRole('checkbox', { name: 'Compare' })[1]);
    const { violations } = await axe.run(document, { rules: { 'color-contrast': { enabled: false } }, resultTypes: ['violations'] });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
  });
});
