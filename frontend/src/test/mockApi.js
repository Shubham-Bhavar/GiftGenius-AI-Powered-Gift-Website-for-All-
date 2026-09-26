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
  stock: 20, inStock: true, active: true, ...extra,
});

export function createDb() {
  return {
    products: [
      product(1, 'Luxury Hamper Box', 'gift sets', 499, { badge: { text: 'Bestseller', className: 'pbadge--bestseller' }, tags: ['for-her', 'budget'] }),
      product(3, 'Classic Rose Bouquet', 'flowers', 599, { occasion: ['anniversary', 'valentine'], tags: ['for-her'] }),
      product(4, 'Signature Perfume', 'fragrance', 1199, { occasion: ['anniversary'], tags: ['for-her', 'premium'], rating: 4.9 }),
      product(6, 'Artisan Chocolate Box', 'food & sweets', 299, { tags: ['budget'] }),
      product(9, '<img src=x onerror=alert(1)> Mug', 'home decor', 350, { tags: ['for-him'] }),
    ],
    users: [
      { id: 1, email: 'asha@example.com', password: 'correct-horse', fullName: 'Asha Rao', phone: null, role: 'CUSTOMER' },
      { id: 2, email: 'admin@example.com', password: 'admin-password', fullName: 'Store Admin', phone: null, role: 'ADMIN' },
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
  };
}

const problem = (status, detail, errors) => HttpResponse.json({ status, detail, errors }, { status });
const userDto = ({ password, ...u }) => u;

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
    return { accessToken: token, expiresIn: 900, user: userDto(user) };
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
      const user = { id: db.users.length + 1, role: 'CUSTOMER', phone: null, ...body };
      db.users.push(user);
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
    http.get(`${API}/auth/me`, authed(({ user }) => HttpResponse.json(userDto(user)))),

    // Catalog
    http.get(`${API}/products/categories`, () =>
      HttpResponse.json([...new Set(db.products.map((p) => p.category))].map((category) => ({ category, count: 1 })))),
    http.get(`${API}/products/:id/related`, ({ params }) => HttpResponse.json(db.products.filter((p) => p.id !== Number(params.id)).slice(0, 2))),
    http.get(`${API}/products/:id`, ({ params }) => {
      const p = db.products.find((x) => x.id === Number(params.id));
      return p ? HttpResponse.json(p) : problem(404, "We couldn't find that gift.");
    }),
    http.get(`${API}/products`, ({ request }) => {
      const q = new URL(request.url).searchParams.get('q')?.toLowerCase();
      const content = q ? db.products.filter((p) => p.name.toLowerCase().includes(q)) : db.products;
      return HttpResponse.json({ content, page: 0, size: 24, totalElements: content.length, totalPages: 1 });
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

    // Admin
    http.get(`${API}/admin/stats`, authed(({ user }) => (user.role !== 'ADMIN' ? problem(403, "You don't have access to this.")
      : HttpResponse.json({ ordersLast30Days: 12, paidRevenueLast30Days: 15400, awaitingDispatch: 3, awaitingPayment: 1,
        lowStock: [{ id: 4, name: 'Signature Perfume', stock: 2 }] })))),
  ];
}
