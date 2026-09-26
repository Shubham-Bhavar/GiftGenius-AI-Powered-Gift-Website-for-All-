import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from './renderApp.jsx';

const grid = () => screen.getByRole('list', { name: 'Products' });
const names = () => within(grid()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('homepage (original design, live data)', () => {
  it('renders the original hero, occasions, promo, testimonials and newsletter', async () => {
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Find the\s*Perfect Gift\s*for Every Occasion/);
    expect(screen.getByRole('heading', { name: 'Shop by Occasion' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Baby gifts' })).toHaveAttribute('href', '/shop?occasion=baby');
    expect(screen.getByRole('heading', { name: /Season Sale/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Loved by Gift-Givers' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Get Gift Inspiration' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Find My Perfect Gift/ })).toHaveAttribute('href', '/gift-finder');
    expect(await screen.findByRole('heading', { name: 'Luxury Hamper Box' })).toBeInTheDocument();
  });

  it('filters the grid with the original pills and sorts it', async () => {
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: 'Luxury Hamper Box' });
    await user.click(screen.getByRole('button', { name: 'Premium' }));
    expect(names()).toEqual(['Signature Perfume']);
    await user.click(screen.getByRole('button', { name: 'Under ₹999' }));
    expect(names()).toEqual(['Luxury Hamper Box', 'Classic Rose Bouquet', 'Artisan Chocolate Box', '<img src=x onerror=alert(1)> Mug']);
    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.selectOptions(screen.getByLabelText('Sort products'), 'price-desc');
    expect(names()[0]).toBe('Signature Perfume');
  });

  it('filters live from the header search, with suggestions', async () => {
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: 'Luxury Hamper Box' });
    await user.type(screen.getByRole('combobox', { name: 'Search gifts' }), 'perf');
    expect(await screen.findByRole('option', { name: 'Signature Perfume' })).toBeInTheDocument();
    await waitFor(() => expect(names()).toEqual(['Signature Perfume']));
    expect(screen.getByText('1 product found')).toBeInTheDocument();
  });

  it('renders untrusted product text as text, never as HTML', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: '<img src=x onerror=alert(1)> Mug' })).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it('swaps a broken product photo for a branded placeholder', async () => {
    renderApp('/');
    const img = await screen.findByRole('img', { name: 'Luxury Hamper Box' });
    fireEvent.error(img);
    await waitFor(() => expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/));
  });

  it('adds to the guest cart with the original "+ Add → ✓ Added" feedback, and opens the cart sidebar', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Add Signature Perfume to cart' }));
    expect(await screen.findByRole('button', { name: 'Add Signature Perfume to cart' })).toHaveTextContent('✓ Added');
    expect(screen.getByTestId('cart-count')).toHaveTextContent('1');
    expect(JSON.parse(localStorage.getItem('gg-cart'))).toMatchObject([{ productId: 4, quantity: 1 }]);
    expect(screen.getByRole('status', { hidden: true, name: '' })).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Open cart, 1 item/ }));
    const sidebar = screen.getByRole('dialog', { name: 'Shopping cart' });
    expect(sidebar).not.toHaveAttribute('hidden');
    expect(within(sidebar).getByText('Signature Perfume')).toBeInTheDocument();
    expect(within(sidebar).getByText(/unlocked free shipping/)).toBeInTheDocument();
    await user.click(within(sidebar).getByRole('button', { name: 'Increase quantity' }));
    await waitFor(() => expect(screen.getByTestId('cart-count')).toHaveTextContent('2'));
    await user.click(within(sidebar).getByRole('button', { name: 'Remove Signature Perfume from cart' }));
    expect(within(sidebar).getByText(/Your cart is empty/)).toBeInTheDocument();
  });

  it('opens Quick View and adds from it', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Quick view Classic Rose Bouquet' }));
    const modal = screen.getByRole('dialog', { name: 'Product quick view' });
    expect(within(modal).getByRole('heading', { name: 'Classic Rose Bouquet' })).toBeInTheDocument();
    await user.click(within(modal).getByRole('button', { name: 'Add to Cart →' }));
    expect(screen.getByTestId('cart-count')).toHaveTextContent('1');
    expect(screen.getByText('Added to cart! 🛒')).toBeInTheDocument();
  });

  it('saves to the wishlist and updates the header heart', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Add Artisan Chocolate Box to wishlist' }));
    expect(screen.getByRole('button', { name: 'Remove Artisan Chocolate Box from wishlist' })).toHaveTextContent('❤️');
    expect(screen.getByRole('button', { name: 'My wishlist, 1 items' })).toBeInTheDocument();
  });

  it('subscribes to the newsletter and validates the email first', async () => {
    const { user } = renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Subscribe →' }));
    expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your email address'), 'riya@example.com');
    await user.click(screen.getByRole('button', { name: 'Subscribe →' }));
    expect(await screen.findByText('Subscribed! 🎉 Check your inbox.')).toBeInTheDocument();
  });
});

describe('entry animation', () => {
  it('plays once per session and opens with Enter', async () => {
    sessionStorage.clear();
    renderApp('/');
    expect(screen.getByText(/to open your gift/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Enter' });
    });
    expect(document.querySelectorAll('.confetti-piece').length).toBe(80);
    expect(sessionStorage.getItem('gg-entry-shown')).toBe('1');
  });

  it('is skipped when already shown this session', () => {
    renderApp('/');
    expect(screen.queryByText(/to open your gift/)).toBeNull();
  });
});
