import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderApp } from './renderApp.jsx';
import { db } from './setup.js';

describe('AI gift quiz (original 6-question design)', () => {
  it('walks the quiz and shows AI picks with reasons and a card message', async () => {
    const { user } = renderApp('/gift-finder');
    expect(await screen.findByText('01 / 06')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Partner \/ Spouse/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: /Anniversary/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: /Flowers & Fragrance/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: /Luxury & Premium/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: /₹500 – ₹1,500/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    expect(screen.getByText('06 / 06')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Extra details about them'), 'She loves rose scents');
    await user.click(screen.getByRole('button', { name: '✨ Find My Gifts' }));

    expect(await screen.findByText('✨ Picked by GiftGenius AI')).toBeInTheDocument();
    expect(screen.getByText('✨ A signature scent she will wear every day.')).toBeInTheDocument();
    expect(screen.getByText('Happy anniversary, my love.')).toBeInTheDocument();
    expect(db.lastRecommendation).toEqual({
      recipient: 'partner', occasion: 'anniversary', budget: 1500, interests: ['flowers', 'fragrance'],
      personality: 'expressive', notes: 'She loves rose scents', limit: 4,
    });
    await user.click(screen.getAllByRole('button', { name: '+ Add to Cart' })[0]);
    expect(screen.getByTestId('cart-count')).toHaveTextContent('1');
  });

  it('turns answers the catalog has no field for into notes, and surfaces errors', async () => {
    db.aiSource = 'rules';
    const { user } = renderApp('/gift-finder');
    await user.click(await screen.findByRole('button', { name: /Child \/ Baby/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: /Wedding/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: /A Bit of Everything/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: /Practical & Useful/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: /₹5,000\+/ }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));

    db.aiDown = true;
    await user.click(screen.getByRole('button', { name: '✨ Find My Gifts' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(db.lastRecommendation).toMatchObject({
      occasion: 'anniversary', notes: 'The gift is for a child or baby. It is a wedding gift.', interests: ['gift sets'],
    });
    expect(db.lastRecommendation.recipient).toBeUndefined();
    expect(db.lastRecommendation.budget).toBeUndefined();

    db.aiDown = false;
    await user.click(screen.getByRole('button', { name: '✨ Find My Gifts' }));
    expect(await screen.findByText('Matched from our curated catalog')).toBeInTheDocument();
  });
});

describe('gift finder modal (homepage design)', () => {
  it('opens from the shop page and returns AI picks', async () => {
    const { user } = renderApp('/shop');
    await user.click(await screen.findByRole('button', { name: /Not sure\? Ask GiftGenius AI/ }));
    const modal = screen.getByRole('dialog', { name: 'GiftGenius Gift Finder' });
    await user.click(within(modal).getByRole('button', { name: /Partner/ }));
    await user.click(within(modal).getByRole('button', { name: 'Continue →' }));
    await user.click(within(modal).getByRole('button', { name: /Anniversary/ }));
    await user.click(within(modal).getByRole('button', { name: 'Continue →' }));
    await user.click(within(modal).getByRole('button', { name: 'Continue →' }));
    await user.click(within(modal).getByRole('button', { name: /Fragrance/ }));
    await user.click(within(modal).getByRole('button', { name: '✨ Build My Gift Profile' }));
    expect(await within(modal).findByRole('heading', { name: 'Your top picks are ready' }, { timeout: 3000 })).toBeInTheDocument();
    expect(within(modal).getByText('✨ Classic roses for a rose lover.')).toBeInTheDocument();
    expect(db.lastRecommendation).toMatchObject({ recipient: 'partner', occasion: 'anniversary', budget: 1500, interests: ['fragrance'] });
  });
});

describe('order tracking (original track page)', () => {
  it('finds an order by number and email, and hides it from the wrong email', async () => {
    db.orders.push({
      userId: 1, key: 'k', dto: {
        orderNumber: 'GG-ABCD2345', status: 'SHIPPED', paymentStatus: 'PENDING', paymentMethod: 'COD', deliveryType: 'EXPRESS', total: 1298,
        shipping: { fullName: 'Riya Shah', email: 'riya@example.com', city: 'Mumbai' },
        items: [{ productId: 4, name: 'Signature Perfume', image: null, unitPrice: 1199, quantity: 1, lineTotal: 1199 }],
        timeline: [
          { status: 'CONFIRMED', note: 'Order placed', at: '2026-09-20T10:00:00Z' },
          { status: 'PACKED', note: 'Gift wrapped and packed', at: '2026-09-21T10:00:00Z' },
          { status: 'SHIPPED', note: 'Tracking: DTDC 123', at: '2026-09-22T10:00:00Z' },
        ],
        createdAt: '2026-09-20T10:00:00Z',
      },
    });
    const { user } = renderApp('/track?order=GG-ABCD2345');
    expect(await screen.findByLabelText('Order ID')).toHaveValue('GG-ABCD2345');
    await user.type(screen.getByLabelText('Email used for the order'), 'wrong@example.com');
    await user.click(screen.getByRole('button', { name: 'Track 🔍' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No order matches');

    await user.clear(screen.getByLabelText('Email used for the order'));
    await user.type(screen.getByLabelText('Email used for the order'), 'riya@example.com');
    await user.click(screen.getByRole('button', { name: 'Track 🔍' }));
    expect(await screen.findByText('Riya, Mumbai')).toBeInTheDocument();
    expect(screen.getByText('Tracking: DTDC 123')).toBeInTheDocument();
    const current = document.querySelector('.t-item[aria-current="step"]');
    expect(current).toHaveTextContent('Out for Delivery');
  });
});

describe('connected pages', () => {
  it('every header link leads to a real page', async () => {
    const { user } = renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    await user.click(within(nav).getByRole('link', { name: 'Collections' }));
    expect(await screen.findByRole('heading', { name: 'Shop by Category' })).toBeInTheDocument();
    await user.click(within(nav).getByRole('link', { name: 'About' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Gifts That Mean Something');
    await user.click(within(nav).getByRole('link', { name: 'Gifts' }));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('All Gifts');
    expect(within(nav).getByRole('link', { name: 'Gifts' })).toHaveAttribute('aria-current', 'page');
  });

  it('sends the contact form to the API', async () => {
    const { user } = renderApp('/contact?topic=bulk');
    expect(screen.getByLabelText('Topic')).toHaveValue('bulk');
    await user.type(screen.getByLabelText('Your Name'), 'Riya Shah');
    await user.type(screen.getByLabelText('Email'), 'riya@example.com');
    await user.type(screen.getByLabelText('Message'), 'We need 40 hampers for Diwali.');
    await user.click(screen.getByRole('button', { name: 'Send Message →' }));
    expect(await screen.findByRole('heading', { name: 'Thank you for writing to us!' })).toBeInTheDocument();
    expect(db.contactMessages).toEqual([expect.objectContaining({ topic: 'bulk', name: 'Riya Shah' })]);
  });

  it('shows a friendly 404 for unknown pages', async () => {
    renderApp('/definitely-not-a-page');
    expect(await screen.findByRole('heading', { name: "We couldn't find that page" })).toBeInTheDocument();
  });
});

describe('store admin', () => {
  async function signInAs(user, email, password) {
    await user.type(await screen.findByLabelText('Email'), email);
    await user.type(screen.getByLabelText('Password'), password);
    await user.click(screen.getByRole('button', { name: 'Sign In →' }));
  }

  it('is closed to customers', async () => {
    const { user } = renderApp('/login?next=%2Fadmin');
    await signInAs(user, 'asha@example.com', 'correct-horse');
    expect(await screen.findByRole('heading', { name: 'Admins only' })).toBeInTheDocument();
  });

  it('shows KPIs and low stock to admins', async () => {
    const { user } = renderApp('/login?next=%2Fadmin');
    await signInAs(user, 'admin@example.com', 'admin-password');
    expect(await screen.findByText('₹15,400')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Signature Perfume' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '💬 Messages' })).toBeInTheDocument();
  });
});

describe('shop filters', () => {
  it('keeps a filter clicked while the search box is still waiting to search', async () => {
    const { user } = renderApp('/shop');
    await screen.findByRole('link', { name: 'Luxury Hamper Box' });
    await user.type(screen.getByPlaceholderText(/Search chocolates/), 'rose');
    // Click a pill inside the 350 ms search debounce: the delayed search must not wipe it.
    await user.click(screen.getByRole('button', { name: 'Anniversary' }));
    await new Promise((r) => setTimeout(r, 600));
    expect(await screen.findByRole('heading', { level: 1, name: /Results for “rose”/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anniversary' })).toHaveAttribute('aria-pressed', 'true');
  });
});
