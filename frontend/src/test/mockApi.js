/**
 * An in-memory stand-in for the GiftGenius API, mirroring the backend contract closely enough to
 * drive whole user journeys (guest cart → sign-in merge → checkout → tracking → admin).
 */
import { http, HttpResponse } from 'msw';

export const API = 'http://localhost/api';

const product = (id, name, category, price, extra = {}) => ({
  id, slug: name.toLowerCase().replace(/\W+/g, '-'), name, category, price, originalPrice: price + 200,
  rating: 4.8, reviewCount: 120, starsDisplay: '★★★★★', image: `https://img.test/${id}.jpg`, alt: name, badge: null,
  tags: [], occasion: ['birthday'], forWhom: [], personality: [], relationship: ['friend'],
  description: `${name} description`, longDescription: null, isCultural: false, isFestival: false,
  stock: 20, inStock: true, active: true, status: 'APPROVED', createdAt: '2026-09-01T10:00:00Z', ...extra,
});

const SANA = { slug: 'sanas-candles', storeName: "Sana's Candles" };
const MEERA = { slug: 'meera-brass', storeName: 'Meera Brass' };
/** A seller's product: not listed until approved. sellerId stays in the mock only (the API never sends it). */
const sellerProduct = (id, name, sellerId, seller, status, extra = {}) => product(id, name, 'home decor', 450, {
  seller, sellerId, status, active: status === 'APPROVED', rating: 0, reviewCount: 0, starsDisplay: '☆☆☆☆☆', originalPrice: 450,
  occasion: ['birthday'], relationship: [], description: `${name}, hand-poured in Pune.`, ...extra,
});
const store = (slug, storeName, status, extra = {}) => ({
  slug, storeName, description: 'Hand-poured soy candles, made to order.', businessCategory: 'home decor', phone: '+91 98765 43210',
  supportEmail: null, addressLine: '7 FC Road', city: 'Pune', state: 'Maharashtra', pincode: '411004', logoUrl: null, bannerUrl: null,
  status, statusReason: null, createdAt: '2026-09-01T10:00:00Z', reviewedAt: null, ...extra,
});

export function createDb() {
  return {
    products: [
      product(1, 'Luxury Hamper Box', 'gift sets', 499, { badge: { text: 'Bestseller', className: 'pbadge--bestseller' }, tags: ['for-her', 'budget'] }),
      product(3, 'Classic Rose Bouquet', 'flowers', 599, { occasion: ['anniversary', 'valentine'], tags: ['for-her'] }),
      product(4, 'Signature Perfume', 'fragrance', 1199, { occasion: ['anniversary'], tags: ['for-her', 'premium'], rating: 4.9 }),
      product(6, 'Artisan Chocolate Box', 'food & sweets', 299, { tags: ['budget'] }),
      product(9, '<img src=x onerror=alert(1)> Mug', 'home decor', 350, { tags: ['for-him'] }),
      // Marketplace sellers' products that aren't listed (so the shop pages show exactly the five above).
      sellerProduct(21, 'Lavender Soy Candle', 3, SANA, 'PENDING_APPROVAL'),
      sellerProduct(22, 'Cedar Wood Candle', 3, SANA, 'DRAFT', { createdAt: '2026-09-02T10:00:00Z' }),
      sellerProduct(23, 'Rose Petal Candle', 3, SANA, 'REJECTED', { rejectionReason: 'Use a photo of the actual candle.' }),
      sellerProduct(30, 'Brass Diya Set', 5, MEERA, 'DRAFT'),
    ],
    users: [
      { id: 1, email: 'asha@example.com', password: 'correct-horse', fullName: 'Asha Rao', phone: null, role: 'CUSTOMER' },
      { id: 2, email: 'admin@example.com', password: 'admin-password', fullName: 'Store Admin', phone: null, role: 'ADMIN' },
      { id: 3, email: 'sana@example.com', password: 'seller-password', fullName: 'Sana Kulkarni', phone: '+91 98765 43210', role: 'SELLER' },
      { id: 4, email: 'ravi@example.com', password: 'seller-password', fullName: 'Ravi Pending', phone: null, role: 'SELLER' },
      { id: 5, email: 'meera@example.com', password: 'seller-password', fullName: 'Meera Iyer', phone: null, role: 'SELLER' },
    ],
    stores: {
      3: store('sanas-candles', "Sana's Candles", 'APPROVED', { reviewedAt: '2026-09-02T10:00:00Z' }),
      4: store('ravis-rakhis', "Ravi's Rakhis", 'PENDING', { businessCategory: 'cultural' }),
      5: store('meera-brass', 'Meera Brass', 'APPROVED'),
    },
    // Seller views of orders: only that seller's lines (the API filters them; the mock stores them that way).
    sellerOrders: [
      {
        sellerId: 3, orderNumber: 'GG-SELL0001', orderStatus: 'CONFIRMED', fulfillmentStatus: 'NEW', paymentMethod: 'COD',
        deliveryType: 'STANDARD', sellerTotal: 900, createdAt: '2026-09-20T10:00:00Z',
        shipping: { fullName: 'Asha Rao', phone: '+91 98765 11111', addressLine: '12 MG Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
        items: [{ productId: 24, name: 'Vanilla Candle', image: 'https://img.test/24.jpg', unitPrice: 450, quantity: 2, lineTotal: 900,
          customName: 'Priya', customMessage: null, fulfillmentStatus: 'NEW', fulfillmentNote: null, fulfillmentUpdatedAt: null }],
      },
      {
        sellerId: 5, orderNumber: 'GG-SELL0002', orderStatus: 'CONFIRMED', fulfillmentStatus: 'NEW', paymentMethod: 'COD',
        deliveryType: 'STANDARD', sellerTotal: 650, createdAt: '2026-09-21T10:00:00Z',
        shipping: { fullName: 'Kiran', phone: '+91 98765 22222', addressLine: '3 Park St', city: 'Kolkata', state: 'West Bengal', pincode: '700016' },
        items: [{ productId: 31, name: 'Brass Bell', image: null, unitPrice: 650, quantity: 1, lineTotal: 650,
          customName: null, customMessage: null, fulfillmentStatus: 'NEW', fulfillmentNote: null, fulfillmentUpdatedAt: null }],
      },
    ],
    carts: {},
    wishlists: {},
    orders: [],
    tokens: {},
    calls: [],
    refreshCount: 0,
    nextLine: 100,
    aiSource: 'ai',
    resetToken: 'reset-token-1', // the link emailed by "forgot password"; works once
    geoMode: 'ok', // /location/reverse: 'ok' | 'down' | 'abroad'
    geoRequests: [],
  };
}

const problem = (status, detail, errors) => HttpResponse.json({ status, detail, errors }, { status });
const userDto = (db, { password, ...u }) => (db.stores[u.id] ? { ...u, sellerStatus: db.stores[u.id].status } : u);
/** A product as the API sends it: the mock-only owner id removed. */
const productDto = ({ sellerId, ...p }) => p;
const page = (content, size = 20) => HttpResponse.json({ content, page: 0, size, totalElements: content.length, totalPages: 1 });

function cartDto(db, userId) {
  const items = (db.carts[userId] ?? []).map((l) => {
    const p = db.products.find((x) => x.id === l.productId);
    return {
      id: l.id, productId: p.id, name: p.name, image: p.image, unitPrice: p.price, quantity: l.quantity,
      lineTotal: p.price * l.quantity, customName: l.customName, customMessage: l.customMessage, stock: p.stock, available: true,
    };
  });
  return { items, itemCount: items.reduce((n, i) => n + i.quantity, 0), subtotal: items.reduce((n, i) => n + i.lineTotal, 0) };
}

function addLine(db, userId, { productId, quantity, customName = null, customMessage = null }) {
  const lines = (db.carts[userId] ??= []);
  const existing = lines.find((l) => l.productId === productId && l.customName === customName && l.customMessage === customMessage);
  if (existing) existing.quantity = Math.min(10, existing.quantity + quantity);
  else lines.push({ id: db.nextLine++, productId, quantity, customName, customMessage });
}

function quote(db, items, couponCode, deliveryType = 'STANDARD') {
  const lines = items.map(({ productId, quantity }) => {
    const p = db.products.find((x) => x.id === productId);
    return { productId, name: p.name, image: p.image, unitPrice: p.price, quantity, lineTotal: p.price * quantity, available: p.stock };
  });
  const subtotal = lines.reduce((n, l) => n + l.lineTotal, 0);
  let discount = 0;
  let couponStatus = 'NONE';
  let couponMessage = null;
  if (couponCode) {
    if (couponCode.toUpperCase() === 'WELCOME') {
      discount = 100;
      couponStatus = 'APPLIED';
      couponMessage = 'WELCOME applied: you save ₹100.';
    } else {
      couponStatus = 'INVALID';
      couponMessage = "That code isn't valid.";
    }
  }
  const after = subtotal - discount;
  const deliveryFee = { STANDARD: after >= 999 ? 0 : 49, EXPRESS: 99, SAME_DAY: 149 }[deliveryType];
  return {
    lines, subtotal, discount, deliveryFee, total: after + deliveryFee, deliveryType,
    couponCode: couponStatus === 'APPLIED' ? 'WELCOME' : null, couponStatus, couponMessage, freeShippingThreshold: 999, warnings: [],
  };
}

export function handlers(db) {
  const session = (request) => {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    return token && db.tokens[token] ? db.users.find((u) => u.id === db.tokens[token]) : null;
  };
  const issue = (user) => {
    const token = `tok-${user.id}-${Math.random().toString(36).slice(2)}`;
    db.tokens[token] = user.id;
    db.cookieUser = user.id;
    return { accessToken: token, expiresIn: 900, user: userDto(db, user) };
  };
  const authed = (fn) => async ({ request, params }) => {
    const user = session(request);
    if (!user) return problem(401, 'Please sign in to continue.');
    return fn({ request, params, user });
  };
  const log = (request) => db.calls.push({ method: request.method, url: new URL(request.url).pathname, headers: request.headers });

  return [
    http.all(`${API}/*`, ({ request }) => { log(request); }),

    // Auth
    http.post(`${API}/auth/login`, async ({ request }) => {
      const { email, password } = await request.json();
      const user = db.users.find((u) => u.email === email);
      if (!user || user.password !== password) return problem(401, 'Incorrect email or password.');
      return HttpResponse.json(issue(user));
    }),
    http.post(`${API}/auth/register`, async ({ request }) => {
      const body = await request.json();
      if (db.users.some((u) => u.email === body.email)) return problem(409, 'An account with this email already exists. Sign in instead.');
      if (!body.password || body.password.length < 8) return problem(400, 'Some fields need attention.', { password: 'Use 8 to 72 characters' });
      const { seller, ...account } = body;
      if (seller && Object.values(db.stores).some((st) => st.storeName.toLowerCase() === seller.storeName.toLowerCase())) {
        return problem(409, 'A store with that name already exists. Choose another name.');
      }
      const user = { id: db.users.length + 1, phone: null, ...account, role: seller ? 'SELLER' : 'CUSTOMER' };
      db.users.push(user);
      if (seller) db.stores[user.id] = store(seller.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-'), seller.storeName, 'PENDING', seller);
      db.lastRegistration = body;
      return HttpResponse.json(issue(user));
    }),
    http.post(`${API}/auth/refresh`, ({ request }) => {
      db.refreshCount++;
      if (request.headers.get('X-Requested-With') !== 'GiftGenius') return problem(403, 'Missing request header.');
      if (db.refreshStatus) return problem(db.refreshStatus, 'Unavailable');
      const user = db.users.find((u) => u.id === db.cookieUser);
      if (!user) return problem(401, 'Session expired. Please sign in again.');
      return HttpResponse.json(issue(user));
    }),
    http.post(`${API}/auth/password/forgot`, () => new HttpResponse(null, { status: 202 })),
    http.post(`${API}/auth/password/reset`, async ({ request }) => {
      const { token, password } = await request.json();
      if (!password || password.length < 8) return problem(400, 'Some fields need attention.', { password: 'Use 8 to 72 characters' });
      if (!token || token !== db.resetToken) return problem(400, 'This reset link is invalid or has expired. Request a new one.');
      db.resetToken = null;
      db.users[0].password = password;
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(`${API}/auth/logout`, () => { db.cookieUser = null; return new HttpResponse(null, { status: 204 }); }),
    http.get(`${API}/auth/me`, authed(({ user }) => HttpResponse.json(userDto(db, user)))),

    // Catalog
    http.get(`${API}/products/categories`, () =>
      HttpResponse.json([...new Set(db.products.map((p) => p.category))].map((category) => ({ category, count: 1 })))),
    http.get(`${API}/products/:id/related`, ({ params }) => HttpResponse.json(db.products.filter((p) => p.id !== Number(params.id)).slice(0, 2))),
    http.get(`${API}/products/:id`, ({ params }) => {
      const p = db.products.find((x) => x.id === Number(params.id) && x.active);
      return p ? HttpResponse.json(productDto(p)) : problem(404, "We couldn't find that gift.");
    }),
    http.get(`${API}/products`, ({ request }) => {
      const sp = new URL(request.url).searchParams;
      const q = sp.get('q')?.toLowerCase();
      let content = db.products.filter((p) => p.active);
      if (q) content = content.filter((p) => p.name.toLowerCase().includes(q));
      if (sp.get('store')) content = content.filter((p) => p.seller?.slug === sp.get('store'));
      if (sp.get('category')) content = content.filter((p) => p.category === sp.get('category'));
      return HttpResponse.json({ content: content.map(productDto), page: 0, size: 24, totalElements: content.length, totalPages: 1 });
    }),
    http.get(`${API}/stores/:slug`, ({ params }) => {
      const [id, st] = Object.entries(db.stores).find(([, x]) => x.slug === params.slug) ?? [];
      if (!st || st.status !== 'APPROVED') return problem(404, "We couldn't find that store.");
      const listed = db.products.filter((p) => p.sellerId === Number(id) && p.active);
      return HttpResponse.json({ slug: st.slug, storeName: st.storeName, description: st.description, businessCategory: st.businessCategory,
        logoUrl: st.logoUrl, bannerUrl: st.bannerUrl, memberSince: st.createdAt, productCount: listed.length,
        categories: [...new Set(listed.map((p) => p.category))] });
    }),

    // Cart & wishlist
    http.get(`${API}/cart`, authed(({ user }) => HttpResponse.json(cartDto(db, user.id)))),
    http.post(`${API}/cart/items`, authed(async ({ request, user }) => {
      addLine(db, user.id, await request.json());
      return HttpResponse.json(cartDto(db, user.id));
    })),
    http.post(`${API}/cart/merge`, authed(async ({ request, user }) => {
      (await request.json()).items.forEach((i) => addLine(db, user.id, i));
      return HttpResponse.json(cartDto(db, user.id));
    })),
    http.patch(`${API}/cart/items/:id`, authed(async ({ request, params, user }) => {
      const line = db.carts[user.id]?.find((l) => l.id === Number(params.id));
      line.quantity = (await request.json()).quantity;
      return HttpResponse.json(cartDto(db, user.id));
    })),
    http.delete(`${API}/cart/items/:id`, authed(({ params, user }) => {
      db.carts[user.id] = (db.carts[user.id] ?? []).filter((l) => l.id !== Number(params.id));
      return HttpResponse.json(cartDto(db, user.id));
    })),
    http.get(`${API}/wishlist`, authed(({ user }) => HttpResponse.json(db.products.filter((p) => (db.wishlists[user.id] ?? []).includes(p.id))))),
    http.post(`${API}/wishlist/merge`, authed(async ({ request, user }) => {
      const ids = (await request.json()).productIds;
      db.wishlists[user.id] = [...new Set([...(db.wishlists[user.id] ?? []), ...ids])];
      return HttpResponse.json(db.products.filter((p) => db.wishlists[user.id].includes(p.id)));
    })),

    // Checkout & orders
    http.get(`${API}/checkout/options`, () => HttpResponse.json({
      onlinePaymentEnabled: false, cashOnDeliveryEnabled: true,
      delivery: [
        { type: 'STANDARD', label: 'Standard', eta: '3–5 days', fee: 49, freeAbove: 999 },
        { type: 'EXPRESS', label: 'Express', eta: '1–2 days', fee: 99, freeAbove: null },
      ],
    })),
    http.post(`${API}/checkout/quote`, async ({ request }) => {
      const { items, couponCode, deliveryType } = await request.json();
      return HttpResponse.json(quote(db, items, couponCode, deliveryType));
    }),
    http.post(`${API}/orders`, authed(async ({ request, user }) => {
      if (db.failNextOrder) {
        db.failNextOrder = false;
        return HttpResponse.error();
      }
      const key = request.headers.get('Idempotency-Key');
      const existing = db.orders.find((o) => o.userId === user.id && o.key === key);
      if (existing) return HttpResponse.json(existing.dto, { status: 201 });
      const body = await request.json();
      const cart = cartDto(db, user.id);
      if (!cart.items.length) return problem(400, 'Your cart is empty.');
      const q = quote(db, cart.items, body.couponCode, body.deliveryType);
      const dto = {
        orderNumber: `GG-TEST${String(db.orders.length + 1).padStart(4, '0')}`, status: 'CONFIRMED', paymentMethod: 'COD',
        paymentStatus: 'PENDING', deliveryType: body.deliveryType, subtotal: q.subtotal, discount: q.discount,
        deliveryFee: q.deliveryFee, total: q.total, couponCode: q.couponCode, shipping: body.shipping,
        items: cart.items.map((i) => ({ ...i, image: i.image })),
        timeline: [{ status: 'CONFIRMED', note: 'Order placed. Pay when it arrives.', at: '2026-09-25T10:00:00Z' }],
        createdAt: '2026-09-25T10:00:00Z',
      };
      db.orders.push({ userId: user.id, key, dto });
      db.carts[user.id] = [];
      return HttpResponse.json(dto, { status: 201 });
    })),
    http.get(`${API}/orders/track`, ({ request }) => {
      const p = new URL(request.url).searchParams;
      const o = db.orders.find((x) => x.dto.orderNumber === p.get('orderNumber')?.toUpperCase() && x.dto.shipping.email === p.get('email'));
      if (!o) return problem(404, 'No order matches that order ID and email. Check both and try again.');
      const d = o.dto;
      return HttpResponse.json({ orderNumber: d.orderNumber, status: d.status, paymentMethod: d.paymentMethod, paymentStatus: d.paymentStatus, deliveryType: d.deliveryType,
        total: d.total, recipientFirstName: d.shipping.fullName.split(' ')[0], city: d.shipping.city, items: d.items, timeline: d.timeline, createdAt: d.createdAt });
    }),
    http.get(`${API}/orders/:number`, authed(({ params, user }) => {
      const o = db.orders.find((x) => x.userId === user.id && x.dto.orderNumber === params.number);
      return o ? HttpResponse.json(o.dto) : problem(404, 'Order not found.');
    })),
    http.get(`${API}/orders`, authed(({ user }) => {
      const content = db.orders.filter((o) => o.userId === user.id).map(({ dto }) => ({
        orderNumber: dto.orderNumber, status: dto.status, paymentMethod: dto.paymentMethod, paymentStatus: dto.paymentStatus,
        total: dto.total, itemCount: dto.items.reduce((n, i) => n + i.quantity, 0), lineCount: dto.items.length, firstItemName: dto.items[0].name, firstItemImage: dto.items[0].image, createdAt: dto.createdAt,
      }));
      return HttpResponse.json({ content, page: 0, size: 10, totalElements: content.length, totalPages: 1 });
    })),

    // Location
    http.post(`${API}/location/reverse`, authed(async ({ request }) => {
      const body = await request.json();
      db.geoRequests.push(body);
      if (db.geoMode === 'down') return problem(502, "We couldn't look up your location. Please enter your address manually.");
      if (db.geoMode === 'abroad') return HttpResponse.json({ city: 'London', country: 'United Kingdom', countryCode: 'GB' });
      return HttpResponse.json({ line: '14 Carter Road', area: 'Bandra West', city: 'Mumbai', state: 'Maharashtra',
        postcode: '400050', country: 'India', countryCode: 'IN' });
    })),

    // AI
    http.post(`${API}/ai/recommendations`, async ({ request }) => {
      const body = await request.json();
      db.lastRecommendation = body;
      if (db.aiDown) return problem(429, 'Too many requests. Wait a minute and try again.');
      return HttpResponse.json({
        source: db.aiSource,
        summary: 'Romantic, rose-forward picks for your partner.',
        picks: [
          { product: db.products[2], reason: 'A signature scent she will wear every day.', score: 90 },
          { product: db.products[1], reason: 'Classic roses for a rose lover.', score: 80 },
        ],
        giftMessage: 'Happy anniversary, my love.',
      });
    }),
    http.post(`${API}/ai/gift-message`, () => HttpResponse.json({ source: 'ai', messages: ['Happy birthday, Maa!', 'Love you always.', 'For the warmest hugs.'] })),
    http.post(`${API}/newsletter/subscribe`, () => HttpResponse.json({ status: 'subscribed' })),
    http.post(`${API}/contact`, async ({ request }) => {
      const body = await request.json();
      if (!body.message || body.message.length < 10) return problem(400, 'Some fields need attention.', { message: 'Use 10 to 2000 characters' });
      db.contactMessages = [...(db.contactMessages ?? []), body];
      return HttpResponse.json({ status: 'received' }, { status: 202 });
    }),

    // Seller Center: every handler acts on the signed-in seller only, as the API does.
    http.post(`${API}/auth/seller-application`, authed(async ({ request, user }) => {
      if (user.role !== 'CUSTOMER') return problem(409, user.role === 'SELLER' ? 'You already have a store.' : "Admin accounts can't open a store.");
      const body = await request.json();
      user.role = 'SELLER';
      db.stores[user.id] = store(body.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-'), body.storeName, 'PENDING', body);
      db.lastApplication = body;
      return HttpResponse.json(issue(user));
    })),
    ...sellerHandlers(db, authed),

    // Admin
    http.get(`${API}/admin/stats`, authed(({ user }) => (user.role !== 'ADMIN' ? problem(403, "You don't have access to this.")
      : HttpResponse.json({ ordersLast30Days: 12, paidRevenueLast30Days: 15400, awaitingDispatch: 3, awaitingPayment: 1,
        lowStock: [{ id: 4, name: 'Signature Perfume', stock: 2 }], sellersAwaitingReview: 1, productsAwaitingApproval: 1 })))),
    ...adminMarketplaceHandlers(db, authed),
  ];
}

const sellerOnly = (authed, fn) => authed(async (ctx) => (ctx.user.role !== 'SELLER' ? problem(403, "You don't have access to this.") : fn(ctx)));
const adminOnly = (authed, fn) => authed(async (ctx) => (ctx.user.role !== 'ADMIN' ? problem(403, "You don't have access to this.") : fn(ctx)));

function sellerStats(db, sellerId) {
  const mine = db.products.filter((p) => p.sellerId === sellerId);
  const count = (st) => mine.filter((p) => p.status === st).length;
  const orders = db.sellerOrders.filter((o) => o.sellerId === sellerId && o.fulfillmentStatus !== 'CANCELLED');
  const gross = orders.reduce((n, o) => n + o.sellerTotal, 0);
  return {
    totalProducts: mine.length, listedProducts: mine.filter((p) => p.active).length, pendingProducts: count('PENDING_APPROVAL'),
    draftProducts: count('DRAFT'), rejectedProducts: count('REJECTED'), outOfStockProducts: mine.filter((p) => p.status === 'APPROVED' && p.stock === 0).length,
    orders: orders.length, unitsSold: orders.reduce((n, o) => n + o.items.reduce((m, i) => m + i.quantity, 0), 0), grossSales: gross,
    averageOrderValue: orders.length ? gross / orders.length : 0, cancelledOrders: 0,
    ordersToFulfil: orders.filter((o) => ['NEW', 'PACKED'].includes(o.fulfillmentStatus)).length,
  };
}

const orderSummary = (o) => ({
  orderNumber: o.orderNumber, orderStatus: o.orderStatus, fulfillmentStatus: o.fulfillmentStatus,
  itemCount: o.items.reduce((n, i) => n + i.quantity, 0), lineCount: o.items.length, sellerTotal: o.sellerTotal,
  firstItemName: o.items[0].name, firstItemImage: o.items[0].image, shipCity: o.shipping.city, createdAt: o.createdAt,
});
const NEXT = { NEW: ['PACKED', 'SHIPPED'], PACKED: ['SHIPPED'], SHIPPED: ['DELIVERED'], DELIVERED: [], CANCELLED: [] };
const orderDto = ({ sellerId, ...o }) => ({ ...o, nextSteps: o.orderStatus === 'CANCELLED' ? [] : NEXT[o.fulfillmentStatus] });

function sellerHandlers(db, authed) {
  const S = (fn) => sellerOnly(authed, fn);
  /** The product if the seller owns it: 404 if there's none, 403 if it's someone else's (as the API answers). */
  const owned = (user, id) => {
    const p = db.products.find((x) => x.id === Number(id));
    if (!p) return [null, problem(404, 'Product not found.')];
    if (p.sellerId !== user.id) return [null, problem(403, 'You can only manage your own products.')];
    return [p, null];
  };
  const apply = (p, body) => Object.assign(p, {
    name: body.name, description: body.description, longDescription: body.longDescription, category: body.category,
    occasion: body.occasion ?? [], tags: body.tags ?? [], price: body.price, originalPrice: body.compareAtPrice ?? body.price,
    stock: body.stock, inStock: body.stock > 0, image: body.image, alt: body.alt ?? body.name,
  });
  const list = (p) => { p.active = p.status === 'APPROVED'; };
  db.sellerRequests = [];

  return [
    http.get(`${API}/seller/me`, S(({ user }) => HttpResponse.json(db.stores[user.id]))),
    http.put(`${API}/seller/profile`, S(async ({ request, user }) => {
      const body = await request.json();
      db.sellerRequests.push({ type: 'profile', body });
      Object.assign(db.stores[user.id], body);
      return HttpResponse.json(db.stores[user.id]);
    })),
    http.post(`${API}/seller/profile/reapply`, S(({ user }) => {
      Object.assign(db.stores[user.id], { status: 'PENDING', statusReason: null });
      return HttpResponse.json(db.stores[user.id]);
    })),
    http.get(`${API}/seller/dashboard`, S(({ user }) => HttpResponse.json({
      store: db.stores[user.id], stats: sellerStats(db, user.id),
      recentOrders: db.sellerOrders.filter((o) => o.sellerId === user.id).map(orderSummary),
      recentProducts: db.products.filter((p) => p.sellerId === user.id).slice(0, 5).map(productDto),
    }))),
    http.get(`${API}/seller/analytics`, S(({ user }) => {
      const top = db.sellerOrders.filter((o) => o.sellerId === user.id).flatMap((o) => o.items)
        .map((i) => ({ productId: i.productId, name: i.name, unitsSold: i.quantity, sales: i.lineTotal }));
      return HttpResponse.json({ stats: sellerStats(db, user.id), topProducts: top });
    })),
    http.get(`${API}/seller/products`, S(({ request, user }) => {
      const sp = new URL(request.url).searchParams;
      let content = db.products.filter((p) => p.sellerId === user.id);
      const q = sp.get('q')?.toLowerCase();
      if (q) content = content.filter((p) => p.name.toLowerCase().includes(q));
      if (sp.get('status')) content = content.filter((p) => p.status === sp.get('status'));
      if (sp.get('category')) content = content.filter((p) => p.category === sp.get('category'));
      return page(content.map(productDto));
    })),
    http.post(`${API}/seller/products`, S(async ({ request, user }) => {
      const body = await request.json();
      db.sellerRequests.push({ type: 'create', body });
      if (body.submit && db.stores[user.id].status !== 'APPROVED') {
        return problem(403, 'Your store is still being reviewed. Save products as drafts: you can submit them for approval once your store is approved.');
      }
      if (/[<>]/.test(body.name)) return problem(400, 'Some fields need attention.', { name: 'Remove the < and > characters' });
      const p = sellerProduct(Math.max(...db.products.map((x) => x.id)) + 1, body.name, user.id,
        { slug: db.stores[user.id].slug, storeName: db.stores[user.id].storeName }, body.submit ? 'PENDING_APPROVAL' : 'DRAFT');
      apply(p, body);
      list(p);
      db.products.push(p);
      return HttpResponse.json(productDto(p), { status: 201 });
    })),
    http.get(`${API}/seller/products/:id`, S(({ params, user }) => {
      const [p, err] = owned(user, params.id);
      return err ?? HttpResponse.json(productDto(p));
    })),
    http.put(`${API}/seller/products/:id`, S(async ({ request, params, user }) => {
      const [p, err] = owned(user, params.id);
      if (err) return err;
      const body = await request.json();
      db.sellerRequests.push({ type: 'update', id: p.id, body });
      const contentChanged = p.name !== body.name || p.description !== body.description || p.image !== body.image || p.category !== body.category;
      apply(p, body);
      if (body.submit || (p.status === 'APPROVED' && contentChanged)) Object.assign(p, { status: 'PENDING_APPROVAL', rejectionReason: undefined });
      list(p);
      return HttpResponse.json(productDto(p));
    })),
    http.post(`${API}/seller/products/:id/submit`, S(({ params, user }) => {
      const [p, err] = owned(user, params.id);
      if (err) return err;
      Object.assign(p, { status: 'PENDING_APPROVAL', rejectionReason: undefined });
      return HttpResponse.json(productDto(p));
    })),
    http.delete(`${API}/seller/products/:id`, S(({ params, user }) => {
      const [p, err] = owned(user, params.id);
      if (err) return err;
      Object.assign(p, { status: 'ARCHIVED', active: false });
      return new HttpResponse(null, { status: 204 });
    })),
    http.get(`${API}/seller/orders`, S(({ request, user }) => {
      const status = new URL(request.url).searchParams.get('status');
      return page(db.sellerOrders.filter((o) => o.sellerId === user.id && (!status || o.fulfillmentStatus === status)).map(orderSummary));
    })),
    http.get(`${API}/seller/orders/:number`, S(({ params, user }) => {
      const o = db.sellerOrders.find((x) => x.sellerId === user.id && x.orderNumber === params.number);
      return o ? HttpResponse.json(orderDto(o)) : problem(404, 'Order not found.');
    })),
    http.patch(`${API}/seller/orders/:number/status`, S(async ({ request, params, user }) => {
      const o = db.sellerOrders.find((x) => x.sellerId === user.id && x.orderNumber === params.number);
      if (!o) return problem(404, 'Order not found.');
      const { status, note } = await request.json();
      if (!NEXT[o.fulfillmentStatus].includes(status)) return problem(409, `Can't move your part of this order from ${o.fulfillmentStatus} to ${status}.`);
      o.fulfillmentStatus = status;
      o.items.forEach((i) => Object.assign(i, { fulfillmentStatus: status, fulfillmentNote: note ?? i.fulfillmentNote }));
      db.lastFulfilment = { number: o.orderNumber, status, note };
      return HttpResponse.json(orderDto(o));
    })),
  ];
}

function adminMarketplaceHandlers(db, authed) {
  const A = (fn) => adminOnly(authed, fn);
  const detail = (id) => {
    const u = db.users.find((x) => x.id === id);
    return {
      id, sellerName: u.fullName, email: u.email, accountPhone: u.phone, accountEnabled: true, store: db.stores[id], stats: sellerStats(db, id),
      products: db.products.filter((p) => p.sellerId === id).map(productDto),
      recentOrders: db.sellerOrders.filter((o) => o.sellerId === id).map(orderSummary),
    };
  };
  const setStatus = (id, status, statusReason = null) => {
    Object.assign(db.stores[id], { status, statusReason });
    db.products.filter((p) => p.sellerId === id).forEach((p) => { p.active = status === 'APPROVED' && p.status === 'APPROVED'; });
    return HttpResponse.json(detail(id));
  };
  return [
    http.get(`${API}/admin/sellers`, A(({ request }) => {
      const status = new URL(request.url).searchParams.get('status');
      const content = Object.entries(db.stores).filter(([, st]) => !status || st.status === status).map(([id, st]) => {
        const u = db.users.find((x) => x.id === Number(id));
        const d = sellerStats(db, Number(id));
        return { id: Number(id), storeName: st.storeName, slug: st.slug, sellerName: u.fullName, email: u.email, status: st.status,
          productCount: d.totalProducts, pendingProducts: d.pendingProducts, orderCount: d.orders, revenue: d.grossSales, createdAt: st.createdAt };
      });
      return page(content, 25);
    })),
    http.get(`${API}/admin/sellers/:id`, A(({ params }) => (db.stores[params.id] ? HttpResponse.json(detail(Number(params.id))) : problem(404, 'Seller not found.')))),
    http.patch(`${API}/admin/sellers/:id/approve`, A(({ params }) => setStatus(Number(params.id), 'APPROVED'))),
    http.patch(`${API}/admin/sellers/:id/reactivate`, A(({ params }) => setStatus(Number(params.id), 'APPROVED'))),
    http.patch(`${API}/admin/sellers/:id/reject`, A(async ({ request, params }) => setStatus(Number(params.id), 'REJECTED', (await request.json()).reason))),
    http.patch(`${API}/admin/sellers/:id/suspend`, A(async ({ request, params }) => setStatus(Number(params.id), 'SUSPENDED', (await request.json()).reason))),
    http.get(`${API}/admin/products/:id`, A(({ params }) => {
      const p = db.products.find((x) => x.id === Number(params.id));
      return p ? HttpResponse.json(productDto(p)) : problem(404, 'Product not found.');
    })),
    http.get(`${API}/admin/products`, A(({ request }) => {
      const sp = new URL(request.url).searchParams;
      let content = db.products;
      if (sp.get('status')) content = content.filter((p) => p.status === sp.get('status'));
      if (sp.get('owner') === 'marketplace') content = content.filter((p) => p.seller);
      if (sp.get('owner') === 'platform') content = content.filter((p) => !p.seller);
      return page(content.map(productDto), 25);
    })),
    http.patch(`${API}/admin/products/:id/approve`, A(({ params }) => {
      const p = db.products.find((x) => x.id === Number(params.id));
      if (p.status !== 'PENDING_APPROVAL') return problem(409, 'Only products waiting for approval can be approved.');
      Object.assign(p, { status: 'APPROVED', rejectionReason: undefined, active: db.stores[p.sellerId].status === 'APPROVED' });
      return HttpResponse.json(productDto(p));
    })),
    http.patch(`${API}/admin/products/:id/reject`, A(async ({ request, params }) => {
      const p = db.products.find((x) => x.id === Number(params.id));
      Object.assign(p, { status: 'REJECTED', rejectionReason: (await request.json()).reason, active: false });
      return HttpResponse.json(productDto(p));
    })),
  ];
}
