import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { http, HttpResponse } from 'msw';
import { API } from './mockApi.js';
import { renderApp } from './renderApp.jsx';
import { db, server } from './setup.js';

/** Restores a signed-in session the way the app does on page load (refresh cookie → access token). */
function signedInAs(userId) {
  db.cookieUser = userId;
  localStorage.setItem('gg-session', '1');
}
const SANA = 3; // seller, approved store
const RAVI = 4; // seller, store waiting for approval
const ASHA = 1; // customer
const ADMIN = 2;

async function violations() {
  const res = await axe.run(document, { rules: { 'color-contrast': { enabled: false } }, resultTypes: ['violations'] });
  return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const kpi = (label) => screen.getByText(label, { selector: '.adm-kpi span' }).closest('.adm-kpi');

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('seller sign-up and sign-in', () => {
  it('signs up as a seller with store details, checked like the API, and lands in the Seller Center', async () => {
    const { user } = renderApp('/register');
    await screen.findByRole('heading', { level: 1, name: 'Create Account' });
    expect(screen.getByRole('radio', { name: /Customer/ })).toBeChecked();
    expect(screen.queryByLabelText('Store name')).toBeNull();

    await user.click(screen.getByRole('radio', { name: /Seller/ }));
    await user.type(screen.getByLabelText('Full name'), 'Priya Rajan');
    await user.type(screen.getByLabelText('Email'), 'priya@example.com');
    await user.type(screen.getByLabelText('Password'), 'priya-password-1');
    await user.type(screen.getByLabelText('Confirm password'), 'priya-password-1');
    await user.click(screen.getByRole('button', { name: 'Create Seller Account →' }));

    // Nothing is sent until the store details are complete.
    expect(await screen.findByText('Enter your store name.')).toBeInTheDocument();
    expect(screen.getByText('Choose what you sell.')).toBeInTheDocument();
    expect(screen.getByText('Enter a phone number so we can reach you about orders.')).toBeInTheDocument();
    expect(screen.getByText('Enter a 6-digit PIN code.')).toBeInTheDocument();
    expect(db.lastRegistration).toBeUndefined();

    await user.type(screen.getByLabelText('Phone'), '+91 98765 43210');
    await user.type(screen.getByLabelText('Store name'), "Priya's <b>Gifts</b>");
    await user.selectOptions(screen.getByLabelText('What you sell'), 'personalized');
    await user.type(screen.getByLabelText('Business address'), '4 Linking Road');
    await user.type(screen.getByLabelText('City'), 'Mumbai');
    await user.type(screen.getByLabelText('PIN code'), '400050');
    await user.selectOptions(screen.getByLabelText('State'), 'Maharashtra');
    await user.click(screen.getByRole('button', { name: 'Create Seller Account →' }));
    expect(await screen.findByText('Remove the < and > characters.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Store name'));
    await user.type(screen.getByLabelText('Store name'), "Priya's Gifts");
    await user.click(screen.getByRole('button', { name: 'Create Seller Account →' }));

    await screen.findByRole('heading', { level: 1, name: "Priya's Gifts" });
    expect(await screen.findByText('Your store is waiting for approval.', { selector: 'strong' })).toBeInTheDocument();
    expect(db.lastRegistration.seller).toEqual({
      storeName: "Priya's Gifts", businessCategory: 'personalized', phone: '+91 98765 43210', addressLine: '4 Linking Road',
      city: 'Mumbai', state: 'Maharashtra', pincode: '400050',
    });
    expect(db.lastRegistration).not.toHaveProperty('role');
  });

  it('customer sign-up is unchanged', async () => {
    const { user } = renderApp('/register');
    await screen.findByRole('heading', { level: 1, name: 'Create Account' });
    await user.type(screen.getByLabelText('Full name'), 'Riya Shah');
    await user.type(screen.getByLabelText('Email'), 'riya2@example.com');
    await user.type(screen.getByLabelText('Password'), 'riya-password-1');
    await user.type(screen.getByLabelText('Confirm password'), 'riya-password-1');
    await user.click(screen.getByRole('button', { name: 'Create Account →' }));
    await waitFor(() => expect(db.users.find((u) => u.email === 'riya2@example.com')?.role).toBe('CUSTOMER'));
    expect(db.lastRegistration.seller).toBeUndefined();
  });

  it('sellers land in the Seller Center and admins in Store Admin after signing in', async () => {
    const { user, unmount } = renderApp('/login');
    await screen.findByRole('heading', { level: 1, name: 'Welcome Back' });
    await user.type(screen.getByLabelText('Email'), 'sana@example.com');
    await user.type(screen.getByLabelText('Password'), 'seller-password');
    await user.click(screen.getByRole('button', { name: 'Sign In →' }));
    expect(await screen.findByRole('heading', { level: 1, name: "Sana's Candles" })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Seller Center sections' })).toBeInTheDocument();
    unmount();
    localStorage.clear();

    const admin = renderApp('/login');
    await screen.findByRole('heading', { level: 1, name: 'Welcome Back' });
    await admin.user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await admin.user.type(screen.getByLabelText('Password'), 'admin-password');
    await admin.user.click(screen.getByRole('button', { name: 'Sign In →' }));
    expect(await screen.findByRole('heading', { level: 1, name: /GiftGenius Dashboard/ })).toBeInTheDocument();
  });

  it('a customer can open a store from their account without a new account', async () => {
    signedInAs(ASHA);
    const { user } = renderApp('/account');
    await screen.findByRole('heading', { level: 1, name: /Account Settings/ });
    await user.click(screen.getByRole('button', { name: 'Start Selling →' }));
    await user.type(screen.getByLabelText('Store Name'), 'Asha Crafts');
    await user.selectOptions(screen.getByLabelText('What You Sell'), 'gift sets');
    await user.type(screen.getByLabelText('Phone', { selector: '#sell-phone' }), '+91 98765 43210');
    await user.type(screen.getByLabelText('Business Address'), '12 MG Road');
    await user.type(screen.getByLabelText('City'), 'Pune');
    await user.selectOptions(screen.getByLabelText('State'), 'Maharashtra');
    await user.type(screen.getByLabelText('PIN Code'), '411001');
    await user.click(screen.getByRole('button', { name: 'Open My Store →' }));

    await screen.findByRole('heading', { level: 1, name: 'Asha Crafts' });
    expect(await screen.findByText('Your store is waiting for approval.', { selector: 'strong' })).toBeInTheDocument();
    expect(db.users[0].role).toBe('SELLER');
    expect(db.lastApplication).toMatchObject({ storeName: 'Asha Crafts', businessCategory: 'gift sets', pincode: '411001' });
  });
});

describe('who can open what', () => {
  it('customers see "Sellers only", guests are asked to sign in, and sellers are kept out of Store Admin', async () => {
    signedInAs(ASHA);
    const c = renderApp('/seller');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sellers only' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start Selling on GiftGenius →' })).toHaveAttribute('href', '/account#sell');
    expect(db.calls.some((call) => call.url.startsWith('/api/seller'))).toBe(false);
    c.unmount();

    localStorage.clear();
    db.cookieUser = null;
    const g = renderApp('/seller/products');
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome Back' })).toBeInTheDocument();
    g.unmount();

    signedInAs(SANA);
    renderApp('/admin');
    expect(await screen.findByRole('heading', { level: 1, name: 'Admins only' })).toBeInTheDocument();
  });

  it("a seller can't open another seller's product", async () => {
    signedInAs(SANA);
    renderApp('/seller/products/30/edit');
    expect(await screen.findByRole('heading', { name: 'Not your product' })).toBeInTheDocument();
    expect(screen.getByText('You can only manage your own products.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Product Name')).toBeNull();
  });
});

describe('Seller Center', () => {
  it('the dashboard shows real figures and recent activity', async () => {
    signedInAs(SANA);
    renderApp('/seller');
    await screen.findByRole('heading', { level: 2, name: "Sana's Candles" });
    expect(within(kpi('Total products')).getByText('3')).toBeInTheDocument();
    expect(within(kpi('Awaiting approval')).getByText('1')).toBeInTheDocument();
    expect(within(kpi('Listed in the shop')).getByText('0')).toBeInTheDocument();
    expect(within(kpi('Revenue')).getByText('₹900')).toBeInTheDocument();
    expect(within(kpi('Orders')).getByText('1 to pack or ship')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GG-SELL0001' })).toHaveAttribute('href', '/seller/orders/GG-SELL0001');
    expect(screen.queryByText('GG-SELL0002')).toBeNull(); // another seller's order
    expect(screen.getByRole('link', { name: 'View My Store ↗' })).toHaveAttribute('href', '/store/sanas-candles');
  });

  it('a store waiting for approval explains itself, starts empty and can only save drafts', async () => {
    signedInAs(RAVI);
    const { user, unmount } = renderApp('/seller');
    await screen.findByRole('heading', { level: 2, name: "Ravi's Rakhis" });
    expect(screen.getByText('Your store is waiting for approval.', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/No orders yet/)).toBeInTheDocument();
    expect(screen.getByText('No products yet.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View My Store ↗' })).toBeNull();
    unmount();

    renderApp('/seller/products/new');
    await screen.findByRole('heading', { name: '➕ Add Product' });
    expect(screen.queryByRole('button', { name: 'Submit for Approval →' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save as Draft' })).toBeInTheDocument();
    expect(screen.getByText('You can submit products for approval once your store is approved.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save as Draft' }));
    expect(await screen.findByText('Enter the product name.')).toBeInTheDocument();
  });

  it('the product list filters, shows why a product was rejected, and archives', async () => {
    signedInAs(SANA);
    const { user } = renderApp('/seller/products');
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(4); // header + 3 own products
    expect(within(table).queryByText('Brass Diya Set')).toBeNull(); // another seller's
    expect(within(table).getByText('Rejected: Use a photo of the actual candle.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'DRAFT');
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Archive Cedar Wood Candle' }));
    await waitFor(() => expect(db.products.find((p) => p.id === 22).status).toBe('ARCHIVED'));
    expect(window.confirm).toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText('Status'), 'PENDING_APPROVAL');
    await user.type(screen.getByLabelText('Search your products'), 'zzz');
    expect(await screen.findByText('No products match these filters.')).toBeInTheDocument();
  });

  it('adds a product, checked like the API, and submits it for approval without sending any owner', async () => {
    signedInAs(SANA);
    const { user } = renderApp('/seller/products/new');
    await screen.findByRole('heading', { name: '➕ Add Product' });
    await user.click(screen.getByRole('button', { name: 'Submit for Approval →' }));
    expect(await screen.findByText('Enter the product name.')).toBeInTheDocument();
    expect(screen.getByText('Choose a category.')).toBeInTheDocument();
    expect(screen.getByText('Enter the price.')).toBeInTheDocument();
    expect(screen.getByText('Add an image link.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Product Name')).toHaveFocus());

    await user.type(screen.getByLabelText('Product Name'), 'Jasmine Candle');
    await user.type(screen.getByLabelText('Short Description'), 'A calming jasmine soy candle in a glass jar.');
    await user.selectOptions(screen.getByLabelText('Category'), 'home decor');
    await user.click(screen.getByRole('checkbox', { name: 'Birthday' }));
    await user.type(screen.getByLabelText('Tags (optional, comma-separated)'), 'handmade, calm');
    await user.type(screen.getByLabelText('Price (₹)'), '499');
    await user.type(screen.getByLabelText('Compare-at Price (₹, optional)'), '399');
    await user.type(screen.getByLabelText('Stock'), '15');
    await user.type(screen.getByLabelText('Image Link'), 'http://img.example.com/jasmine.jpg');
    await user.click(screen.getByRole('button', { name: 'Submit for Approval →' }));
    expect(await screen.findByText("The compare-at price can't be lower than the price.")).toBeInTheDocument();
    expect(screen.getByText('Use an image link that starts with https://')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Compare-at Price (₹, optional)'));
    await user.type(screen.getByLabelText('Compare-at Price (₹, optional)'), '599');
    await user.clear(screen.getByLabelText('Image Link'));
    await user.type(screen.getByLabelText('Image Link'), 'https://img.example.com/jasmine.jpg');
    await user.click(screen.getByRole('button', { name: 'Submit for Approval →' }));

    const row = (await screen.findByRole('link', { name: 'Jasmine Candle' })).closest('tr');
    expect(within(row).getByText('Awaiting approval')).toBeInTheDocument();
    const sent = db.sellerRequests.find((r) => r.type === 'create').body;
    expect(sent).toEqual({
      name: 'Jasmine Candle', description: 'A calming jasmine soy candle in a glass jar.', longDescription: null,
      category: 'home decor', occasion: ['birthday'], tags: ['handmade', 'calm'], price: 499, compareAtPrice: 599, stock: 15,
      image: 'https://img.example.com/jasmine.jpg', alt: null, submit: true,
    });
  });

  it('edits a rejected product and sends it back for approval', async () => {
    signedInAs(SANA);
    const { user } = renderApp('/seller/products/23/edit');
    await screen.findByRole('heading', { name: '✏️ Edit: Rose Petal Candle' });
    expect(screen.getByText(/Use a photo of the actual candle/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Image Link'));
    await user.type(screen.getByLabelText('Image Link'), 'https://img.example.com/rose-candle.jpg');
    await user.click(screen.getByRole('button', { name: 'Submit for Approval →' }));
    await screen.findByRole('table');
    const updated = db.products.find((p) => p.id === 23);
    expect(updated.status).toBe('PENDING_APPROVAL');
    expect(updated.image).toBe('https://img.example.com/rose-candle.jpg');
  });

  it('shows only the seller’s own order lines and updates their fulfilment', async () => {
    signedInAs(SANA);
    const { user, unmount } = renderApp('/seller/orders');
    await screen.findByRole('link', { name: 'GG-SELL0001' });
    expect(screen.queryByText('GG-SELL0002')).toBeNull();
    await user.click(screen.getByRole('link', { name: 'GG-SELL0001' }));

    await screen.findByRole('heading', { name: 'GG-SELL0001' });
    const ship = screen.getByRole('heading', { name: '🚚 Ship To' }).closest('section');
    expect(within(ship).getByText('Asha Rao')).toBeInTheDocument();
    expect(within(ship).getByRole('link', { name: '+91 98765 11111' })).toHaveAttribute('href', 'tel:+919876511111');
    expect(screen.getByText('✍️ Personalise with: Priya')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Update Status →' }));
    expect(await screen.findByText('Choose the new status.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('New status'), 'SHIPPED');
    await user.type(screen.getByLabelText('Note for the customer (optional)'), 'DTDC 123456');
    await user.click(screen.getByRole('button', { name: 'Update Status →' }));
    await waitFor(() => expect(db.lastFulfilment).toEqual({ number: 'GG-SELL0001', status: 'SHIPPED', note: 'DTDC 123456' }));
    expect(await screen.findByRole('option', { name: 'Delivered' })).toBeInTheDocument();
    unmount();

    renderApp('/seller/orders/GG-SELL0002');
    expect(await screen.findByRole('heading', { name: 'Order not found' })).toBeInTheDocument();
  });

  it('analytics report revenue, not profit', async () => {
    signedInAs(SANA);
    renderApp('/seller/analytics');
    await screen.findByRole('heading', { name: '🏆 Top Products' });
    expect(within(kpi('Gross sales')).getByText('₹900')).toBeInTheDocument();
    expect(within(kpi('Average order value')).getByText('₹900')).toBeInTheDocument();
    expect(screen.getByText(/This is revenue, not profit/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vanilla Candle' })).toBeInTheDocument();
  });

  it('store settings save the details and never send status or ownership', async () => {
    signedInAs(SANA);
    const { user } = renderApp('/seller/settings');
    await screen.findByRole('heading', { name: '⚙️ Store Settings' });
    await user.clear(screen.getByLabelText('Store Name'));
    await user.type(screen.getByLabelText('Store Name'), "Sana's Candle Co.");
    await user.type(screen.getByLabelText('Logo Image Link (optional)'), 'ftp://logo');
    await user.click(screen.getByRole('button', { name: 'Save Store Settings →' }));
    expect(await screen.findByText('Use an image link that starts with https://')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Logo Image Link (optional)'));
    await user.click(screen.getByRole('button', { name: 'Save Store Settings →' }));
    await waitFor(() => expect(db.stores[SANA].storeName).toBe("Sana's Candle Co."));
    const body = db.sellerRequests.find((r) => r.type === 'profile').body;
    expect(body).not.toHaveProperty('slug');
    expect(body).not.toHaveProperty('status');
  });
});

describe('marketplace in the shop', () => {
  it("approved sellers' products show their store, which has its own page", async () => {
    Object.assign(db.products.find((p) => p.id === 21), { status: 'APPROVED', active: true });
    const { user, unmount } = renderApp('/shop');
    const byline = await screen.findByRole('link', { name: "Sana's Candles" });
    expect(byline).toHaveAttribute('href', '/store/sanas-candles');
    expect(screen.queryByText('Cedar Wood Candle')).toBeNull(); // drafts never reach the shop
    // GiftGenius's own products carry no byline.
    expect(document.querySelectorAll('.pcard-seller')).toHaveLength(1);
    await user.click(screen.getByRole('link', { name: 'Lavender Soy Candle' }));
    await screen.findByRole('heading', { level: 1, name: 'Lavender Soy Candle' });
    expect(screen.getByText(/Sold by/)).toHaveTextContent("Sold by Sana's Candles");
    expect(screen.getByText('New · no reviews yet')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Visit store →' }));
    await screen.findByRole('heading', { level: 1, name: "Sana's Candles" });
    expect(await screen.findByRole('link', { name: 'Lavender Soy Candle' })).toBeInTheDocument();
    expect(screen.queryByText('7 FC Road')).toBeNull(); // no private address
    unmount();

    renderApp('/store/ravis-rakhis'); // not approved yet
    expect(await screen.findByRole('heading', { level: 1, name: "We couldn't find that store" })).toBeInTheDocument();
  });
});

describe('customer orders with sellers', () => {
  const order = (items) => ({
    userId: ASHA, key: 'k1', dto: {
      orderNumber: 'GG-MIX00001', status: 'CONFIRMED', paymentMethod: 'COD', paymentStatus: 'PENDING', deliveryType: 'STANDARD',
      subtotal: 1149, discount: 0, deliveryFee: 0, total: 1149, couponCode: null,
      shipping: { fullName: 'Asha Rao', email: 'asha@example.com', phone: '+91 98765 11111', addressLine: '12 MG Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
      items, timeline: [{ status: 'CONFIRMED', note: 'Order placed. Pay when it arrives.', at: '2026-09-25T10:00:00Z' }],
      createdAt: '2026-09-25T10:00:00Z',
    },
  });
  const candle = (fulfillmentStatus, fulfillmentNote = null) => ({
    productId: 21, name: 'Lavender Soy Candle', image: null, unitPrice: 425, quantity: 2, lineTotal: 850,
    seller: { slug: 'sanas-candles', storeName: "Sana's Candles" }, fulfillmentStatus, fulfillmentNote,
  });
  const chocolates = { productId: 6, name: 'Artisan Chocolate Box', image: null, unitPrice: 299, quantity: 1, lineTotal: 299 };

  it('shows who sells each line and its progress, and stops online cancelling once a parcel has shipped', async () => {
    db.orders.push(order([candle('SHIPPED', 'Courier: DTDC, tracking D1234567'), chocolates]));
    signedInAs(ASHA);
    renderApp('/account/orders/GG-MIX00001');
    expect(await screen.findByText('🚚 Courier: DTDC, tracking D1234567')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Sana's Candles" })).toHaveAttribute('href', '/store/sanas-candles');
    const candleLine = screen.getByRole('link', { name: 'Lavender Soy Candle' }).closest('.od-mini-item');
    expect(within(candleLine).getByText('Shipped')).toBeInTheDocument();
    const chocolateLine = screen.getByRole('link', { name: 'Artisan Chocolate Box' }).closest('.od-mini-item');
    expect(within(chocolateLine).queryByText(/Sold by/)).toBeNull(); // GiftGenius's own line
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
    expect(screen.getByText(/Part of this order has already shipped/)).toBeInTheDocument();
  });

  it('can still be cancelled while no parcel has shipped, and says the seller is preparing it', async () => {
    db.orders.push(order([candle('NEW'), chocolates]));
    signedInAs(ASHA);
    renderApp('/account/orders/GG-MIX00001');
    expect(await screen.findByRole('button', { name: 'Cancel order' })).toBeInTheDocument();
    const candleLine = screen.getByRole('link', { name: 'Lavender Soy Candle' }).closest('.od-mini-item');
    expect(within(candleLine).getByText('Preparing')).toBeInTheDocument();
    expect(within(candleLine).queryByText('To pack')).toBeNull(); // the Seller Center's wording
  });
});

describe('Store Admin: sellers and product review', () => {
  it('approves a waiting store and suspends an active one with a reason', async () => {
    signedInAs(ADMIN);
    const { user } = renderApp('/admin/sellers?status=PENDING');
    await user.click(await screen.findByRole('link', { name: "Ravi's Rakhis" }));
    await screen.findByRole('heading', { name: "🏪 Ravi's Rakhis" });
    await user.click(screen.getByRole('button', { name: '✓ Approve Store' }));
    await waitFor(() => expect(db.stores[RAVI].status).toBe('APPROVED'));

    await user.click(await screen.findByRole('button', { name: 'Suspend Store' }));
    expect(await screen.findByText('Give a reason the seller will see.')).toBeInTheDocument();
    expect(db.stores[RAVI].status).toBe('APPROVED');
    await user.type(screen.getByLabelText('Reason for suspending'), 'Late deliveries.');
    await user.click(screen.getByRole('button', { name: 'Suspend Store' }));
    await waitFor(() => expect(db.stores[RAVI]).toMatchObject({ status: 'SUSPENDED', statusReason: 'Late deliveries.' }));
    expect(await screen.findByRole('button', { name: 'Reactivate Store' })).toBeInTheDocument();
  });

  it('approves a product from the review queue and can take it down again', async () => {
    signedInAs(ADMIN);
    const { user } = renderApp('/admin/products?status=PENDING_APPROVAL');
    await user.click(await screen.findByRole('button', { name: 'Lavender Soy Candle' }));
    await screen.findByRole('heading', { name: '🏪 Marketplace Review' });
    expect(screen.queryByRole('checkbox', { name: 'Visible in the shop' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '✓ Approve & List' }));
    await waitFor(() => expect(db.products.find((p) => p.id === 21)).toMatchObject({ status: 'APPROVED', active: true }));

    await user.selectOptions(await screen.findByLabelText('Review status'), '');
    await user.click(await screen.findByRole('button', { name: 'Lavender Soy Candle' }));
    await screen.findByRole('heading', { name: '🏪 Marketplace Review' });
    await user.type(screen.getByLabelText('Reason for taking it down'), 'Wrong category.');
    await user.click(screen.getByRole('button', { name: 'Take Down' }));
    await waitFor(() => expect(db.products.find((p) => p.id === 21)).toMatchObject({ status: 'REJECTED', active: false, rejectionReason: 'Wrong category.' }));
  });
});

describe('store status and failures', () => {
  it('a seller signing up with an email that already has an account is told to open a store from it', async () => {
    const { user } = renderApp('/register?type=seller');
    await screen.findByLabelText('Store name');
    await user.type(screen.getByLabelText('Full name'), 'Asha Rao');
    await user.type(screen.getByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText('Phone'), '+91 98765 43210');
    await user.type(screen.getByLabelText('Password'), 'another-password-1');
    await user.type(screen.getByLabelText('Confirm password'), 'another-password-1');
    await user.type(screen.getByLabelText('Store name'), 'Asha Crafts');
    await user.selectOptions(screen.getByLabelText('What you sell'), 'gift sets');
    await user.type(screen.getByLabelText('Business address'), '12 MG Road');
    await user.type(screen.getByLabelText('City'), 'Pune');
    await user.type(screen.getByLabelText('PIN code'), '411001');
    await user.selectOptions(screen.getByLabelText('State'), 'Maharashtra');
    await user.click(screen.getByRole('button', { name: 'Create Seller Account →' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in, then choose "Sell on GiftGenius" in your account');
  });

  it("a suspended store sees why and isn't offered product changes", async () => {
    Object.assign(db.stores[SANA], { status: 'SUSPENDED', statusReason: 'Late deliveries' });
    signedInAs(SANA);
    const { unmount } = renderApp('/seller');
    await screen.findByRole('heading', { level: 2, name: "Sana's Candles" });
    expect(screen.getByText('Your store is suspended', { exact: false, selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/Reason: Late deliveries/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '+ Add Product' })).toBeNull();
    unmount();

    renderApp('/seller/products');
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /^Archive / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Submit / })).toBeNull();
    expect(screen.queryByRole('link', { name: '+ Add Product' })).toBeNull();
    expect(screen.getAllByRole('link', { name: /^Edit / }).length).toBeGreaterThan(0); // still viewable
  });

  it('shows "Unable to load" with a retry when the server fails, never a blank page or raw error', async () => {
    let fail = true;
    server.use(http.get(`${API}/seller/dashboard`, () => (fail
      ? HttpResponse.json({ status: 500, detail: 'java.lang.NullPointerException at SellerService' }, { status: 500 })
      : undefined)));
    signedInAs(SANA);
    const { user } = renderApp('/seller');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to load your dashboard.');
    expect(alert).not.toHaveTextContent(/NullPointer|java/);
    fail = false;
    await user.click(within(alert).getByRole('button', { name: '↻ Retry' }));
    expect(await screen.findByRole('heading', { level: 2, name: "Sana's Candles" })).toBeInTheDocument();
  });

  it('explains when the server can’t be reached', async () => {
    server.use(http.get(`${API}/seller/products`, () => HttpResponse.error()));
    signedInAs(SANA);
    renderApp('/seller/products');
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load your products. Check your connection and try again.');
  });

  it('an expired session on a seller page leads back to sign-in', async () => {
    signedInAs(SANA);
    const { user } = renderApp('/seller');
    await screen.findByRole('heading', { level: 2, name: "Sana's Candles" });
    // The session ends on the server: the access token is refused and the refresh cookie is gone.
    db.tokens = {};
    db.cookieUser = null;
    await user.click(screen.getByRole('link', { name: '📈 Analytics' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome Back' })).toBeInTheDocument();
  });
});

describe('accessibility of the marketplace pages (axe-core)', () => {
  // [who, page, text that appears once the page's data has loaded]
  it.each([
    [SANA, '/seller', '📦 Recent Orders'],
    [SANA, '/seller/products', 'Rose Petal Candle'],
    [SANA, '/seller/products/new', '➕ Add Product'],
    [SANA, '/seller/orders/GG-SELL0001', '🚚 Ship To'],
    [SANA, '/seller/analytics', '🏆 Top Products'],
    [SANA, '/seller/settings', '⚙️ Store Settings'],
    [RAVI, '/seller', 'No products yet.'],
    [ADMIN, '/admin/sellers', "Ravi's Rakhis"],
    [ADMIN, '/admin/sellers/3', '🎁 Products'],
    [ADMIN, '/admin/products?edit=21', '🏪 Marketplace Review'],
  ])('user %i at %s has one h1 and no violations', async (userId, path, ready) => {
    signedInAs(userId);
    renderApp(path);
    await screen.findAllByText(ready);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await violations()).toEqual([]);
  });

  it('the seller sign-up form and a storefront have no violations', async () => {
    const { user, unmount } = renderApp('/register?type=seller');
    await screen.findByLabelText('Store name');
    await user.click(screen.getByRole('button', { name: 'Create Seller Account →' }));
    await screen.findByText('Enter your store name.');
    expect(await violations()).toEqual([]);
    unmount();

    Object.assign(db.products.find((x) => x.id === 21), { status: 'APPROVED', active: true });
    renderApp('/store/sanas-candles');
    await screen.findByRole('link', { name: 'Lavender Soy Candle' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await violations()).toEqual([]);
  });
});
