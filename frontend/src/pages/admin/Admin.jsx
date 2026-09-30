import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useParams, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import OrderTimeline from '../../components/OrderTimeline.jsx';
import SafeImg from '../../components/SafeImg.jsx';
import { RequireAdmin } from '../../components/guards.jsx';
import { EmptyState, ErrorNote, Field, Notice, PageHero, Pagination, PaymentPill, Spinner, StatusPill } from '../../components/ui.jsx';
import { OrderItems, OrderTotals } from '../OrderDetail.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { api } from '../../lib/api.js';
import { trapFocus } from '../../lib/focus.js';
import { ORDER_STATUS, date, dateTime, inr, orderItemsLabel, titleCase } from '../../lib/format.js';
import { FULFILMENT_STATUS, PRODUCT_STATUS, SELLER_STATUS, productState } from '../../lib/marketplace.js';

const NEXT_STATUS = {
  PENDING_PAYMENT: ['CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** Orders that still need packing or shipping (what the dashboard's "To pack & ship" counts). */
const TO_SHIP = 'CONFIRMED,PACKED';

export function AdminLayout() {
  useDocumentTitle('Store Admin');
  return (
    <RequireAdmin>
      <PageHero eyebrow="Store Admin" title="GiftGenius" em="Dashboard">Orders, products, sellers, coupons and customer messages.</PageHero>
      <div className="adm-page">
        <nav className="adm-tabs" aria-label="Admin sections">
          <NavLink to="/admin" end>📊 Dashboard</NavLink>
          <NavLink to="/admin/orders">📦 Orders</NavLink>
          <NavLink to="/admin/products">🎁 Products</NavLink>
          <NavLink to="/admin/sellers">🏪 Sellers</NavLink>
          <NavLink to="/admin/coupons">🎟️ Coupons</NavLink>
          <NavLink to="/admin/messages">💬 Messages</NavLink>
        </nav>
        <Outlet />
      </div>
    </RequireAdmin>
  );
}

export function AdminDashboard() {
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: api.admin.stats, refetchInterval: 60_000 });
  if (stats.isPending) return <Spinner />;
  if (stats.error) return <ErrorNote error={stats.error} onRetry={() => stats.refetch()} />;
  const s = stats.data;
  return (
    <>
      <div className="adm-kpis">
        <div className="adm-kpi"><span>Orders · 30 days</span><strong>{s.ordersLast30Days}</strong></div>
        <div className="adm-kpi"><span>Paid revenue · 30 days</span><strong>{inr(s.paidRevenueLast30Days)}</strong></div>
        <Link to={`/admin/orders?status=${TO_SHIP}`} className="adm-kpi adm-kpi--link"><span>To pack &amp; ship</span><strong>{s.awaitingDispatch}</strong></Link>
        <Link to="/admin/orders?status=PENDING_PAYMENT" className="adm-kpi adm-kpi--link"><span>Awaiting payment</span><strong>{s.awaitingPayment}</strong></Link>
        <Link to="/admin/sellers?status=PENDING" className="adm-kpi adm-kpi--link"><span>Sellers to review</span><strong>{s.sellersAwaitingReview ?? 0}</strong></Link>
        <Link to="/admin/products?status=PENDING_APPROVAL" className="adm-kpi adm-kpi--link"><span>Products to approve</span><strong>{s.productsAwaitingApproval ?? 0}</strong></Link>
      </div>
      <div className="od-card">
        <h2>⚠️ Low Stock</h2>
        {s.lowStock.length === 0 ? <p className="co-muted">Every product has 10 or more in stock.</p> : (
          <table className="adm-table">
            <thead><tr><th>Product</th><th className="num">In stock</th></tr></thead>
            <tbody>
              {s.lowStock.map((p) => (
                <tr key={p.id}><td><Link to={`/admin/products?edit=${p.id}`}>{p.name}</Link></td><td className={`num ${p.stock === 0 ? 'text-bad' : ''}`}>{p.stock}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function OrderDrawer({ number, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const order = useQuery({ queryKey: ['admin', 'order', number], queryFn: () => api.admin.order(number) });
  const [next, setNext] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const closeBtn = useRef(null);

  // Focus the drawer on open, close on Escape, and hand focus back to the order link on close.
  useEffect(() => {
    const opener = document.activeElement;
    closeBtn.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [onClose]);

  const update = async (e) => {
    e.preventDefault();
    if (next === 'CANCELLED' && !window.confirm('Cancel this order? Stock is released and paid orders are marked for refund.')) return;
    setBusy(true);
    try {
      const o = await api.admin.updateStatus(number, next, note.trim() || undefined);
      qc.setQueryData(['admin', 'order', number], o);
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast(`Order ${number} → ${ORDER_STATUS[o.status].label}`);
      setNext('');
      setNote('');
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const o = order.data;
  return (
    <>
      <div className="cart-overlay open" onClick={onClose} aria-hidden="true" />
      <div className="cart-side adm-drawer" role="dialog" aria-modal="true" aria-label={`Order ${number}`} onKeyDown={trapFocus}>
        <div className="cart-hd">
          <h2>{number}</h2>
          <button type="button" className="cart-close-btn" aria-label="Close order details" ref={closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className="cart-body">
          {order.isPending && <Spinner />}
          <ErrorNote error={order.error} />
          {o && (
            <>
              <div className="od-pills"><StatusPill status={o.status} /><PaymentPill status={o.paymentStatus} method={o.paymentMethod} orderStatus={o.status} /></div>
              {NEXT_STATUS[o.status].length > 0 && (
                <form className="adm-status-form" onSubmit={update}>
                  <Field label="Move to" as="select" required value={next} onChange={(e) => setNext(e.target.value)}>
                    <option value="">Choose…</option>
                    {NEXT_STATUS[o.status].map((s) => <option key={s} value={s}>{ORDER_STATUS[s].label}</option>)}
                  </Field>
                  <Field label="Note for the customer (optional)" maxLength={255} value={note} placeholder="e.g. Tracking: DTDC 123456"
                    onChange={(e) => setNote(e.target.value)} />
                  <button className="btn-primary" disabled={busy || !next}>{busy ? 'Updating…' : 'Update Status →'}</button>
                </form>
              )}
              <h3 className="adm-drawer-h">Ship to</h3>
              <p className="adm-drawer-text">{o.shipping.fullName} · {o.shipping.phone} · {o.shipping.email}<br />
                {o.shipping.addressLine}, {o.shipping.city}{o.shipping.state ? `, ${o.shipping.state}` : ''} {o.shipping.pincode}</p>
              <h3 className="adm-drawer-h">Items</h3>
              <OrderItems items={o.items} />
              <OrderTotals order={o} />
              <h3 className="adm-drawer-h">Timeline</h3>
              <OrderTimeline status={o.status} timeline={o.timeline} paymentMethod={o.paymentMethod} paymentStatus={o.paymentStatus} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function AdminOrders() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(null);
  const closeDrawer = useCallback(() => setOpen(null), []);
  const orders = useQuery({
    queryKey: ['admin', 'orders', status, page],
    queryFn: () => api.admin.orders({ status: status || undefined, page, size: 25 }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div className="adm-toolbar">
        <label htmlFor="adm-status" className="sr-only">Status</label>
        <select id="adm-status" className="sort-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">All orders</option>
          <option value={TO_SHIP}>To pack &amp; ship</option>
          {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button type="button" className="btn-outline btn-sm" onClick={() => orders.refetch()}>↻ Refresh</button>
      </div>
      <ErrorNote error={orders.error} />
      <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Orders table">
        <table className="adm-table">
          <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Sold by</th><th>Status</th><th>Payment</th><th className="num">Total</th><th>Placed</th></tr></thead>
          <tbody>
            {orders.isPending && <tr><td colSpan={8}><Spinner inline /></td></tr>}
            {orders.data?.content.length === 0 && <tr><td colSpan={8} className="co-muted">No orders here.</td></tr>}
            {orders.data?.content.map((o) => (
              <tr key={o.orderNumber}>
                <td><button type="button" className="adm-link" onClick={() => setOpen(o.orderNumber)}>{o.orderNumber}</button></td>
                <td>{o.customerEmail}</td>
                <td>{orderItemsLabel(o)}</td>
                <td>{o.sellers?.length ? o.sellers.join(', ') : 'GiftGenius'}</td>
                <td><StatusPill status={o.status} /></td>
                <td><PaymentPill status={o.paymentStatus} method={o.paymentMethod} orderStatus={o.status} /></td>
                <td className="num">{inr(o.total)}</td>
                <td title={dateTime(o.createdAt)}>{date(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {orders.data && <Pagination page={orders.data.page} totalPages={orders.data.totalPages} onChange={setPage} />}
      {open && <OrderDrawer number={open} onClose={closeDrawer} />}
    </>
  );
}

const EMPTY_PRODUCT = {
  name: '', category: '', description: '', longDescription: '', price: '', originalPrice: '', image: '', alt: '',
  badgeText: '', stock: 0, active: true, tags: '', occasion: '', relationship: '', personality: '',
};
const toForm = (p) => ({
  ...EMPTY_PRODUCT, ...p, longDescription: p.longDescription ?? '', alt: p.alt ?? '', badgeText: p.badge?.text ?? '',
  tags: p.tags.join(', '), occasion: p.occasion.join(', '), relationship: p.relationship.join(', '), personality: p.personality.join(', '),
});
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const BADGE_CLASS = { bestseller: 'pbadge--bestseller', new: 'pbadge--new', sale: 'pbadge--sale', 'top rated': 'pbadge--rated' };

function ProductForm({ product, onDone }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState(() => (product ? toForm(product) : EMPTY_PRODUCT));
  const [state, setState] = useState({ busy: false, error: null, errors: {} });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: null, errors: {} });
    const badgeText = f.badgeText.trim();
    const body = {
      name: f.name, category: f.category, description: f.description, longDescription: f.longDescription || null,
      price: Number(f.price), originalPrice: Number(f.originalPrice), image: f.image, alt: f.alt || null,
      badgeText: badgeText || null, badgeClass: badgeText ? BADGE_CLASS[badgeText.toLowerCase()] ?? 'pbadge--new' : null,
      stock: Number(f.stock), active: f.active, tags: list(f.tags), occasion: list(f.occasion),
      relationship: list(f.relationship), personality: list(f.personality),
      rating: product?.rating, reviewCount: product?.reviewCount, forWhom: product?.forWhom,
      isCultural: product?.isCultural, isFestival: product?.isFestival,
    };
    try {
      if (product) await api.admin.updateProduct(product.id, body);
      else await api.admin.createProduct(body);
      ['admin', 'products', 'product', 'catalog', 'categories'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast(product ? 'Product saved ✓' : 'Product created ✓');
      onDone();
    } catch (err) {
      setState({ busy: false, error: err, errors: err.errors || {} });
    }
  };

  const er = state.errors;
  return (
    <form className="co-form-section" onSubmit={save}>
      <h2>{product ? `✏️ Edit: ${product.name}` : '➕ New Product'}</h2>
      <div className="co-form-row">
        <Field label="Name" required maxLength={150} value={f.name} onChange={set('name')} error={er.name} />
        <Field label="Category" required maxLength={40} value={f.category} onChange={set('category')} error={er.category} hint="e.g. gift sets, flowers" />
      </div>
      <div className="co-form-row co-form-row--3">
        <Field label="Price (₹)" required type="number" min="0" step="1" value={f.price} onChange={set('price')} error={er.price} />
        <Field label="Original Price (₹)" required type="number" min="0" step="1" value={f.originalPrice} onChange={set('originalPrice')} error={er.originalPrice} />
        <Field label="Stock" required type="number" min="0" max="1000000" value={f.stock} onChange={set('stock')} error={er.stock} />
      </div>
      <div className="co-form-row full">
        <Field label="Short Description" required maxLength={500} as="textarea" rows={2} value={f.description} onChange={set('description')} error={er.description} />
      </div>
      <div className="co-form-row full">
        <Field label="Long Description" as="textarea" rows={3} value={f.longDescription} onChange={set('longDescription')} />
      </div>
      <div className="co-form-row">
        <Field label="Image URL" required type="url" maxLength={1000} value={f.image} onChange={set('image')} error={er.image} />
        <Field label="Image Alt Text" maxLength={255} value={f.alt} onChange={set('alt')} />
      </div>
      <div className="co-form-row">
        <Field label="Badge" maxLength={40} value={f.badgeText} onChange={set('badgeText')} hint="Bestseller, New, Sale or Top Rated" />
        <Field label="Tags (comma-separated)" value={f.tags} onChange={set('tags')} hint="for-her, for-him, premium, budget, personalized" />
      </div>
      <div className="co-form-row co-form-row--3">
        <Field label="Occasions" value={f.occasion} onChange={set('occasion')} hint="birthday, anniversary, baby…" />
        <Field label="Good For" value={f.relationship} onChange={set('relationship')} hint="partner, parent, friend…" />
        <Field label="Personalities" value={f.personality} onChange={set('personality')} hint="expressive, practical…" />
      </div>
      {product?.seller ? (
        <p className="co-muted">Sold by {product.seller.storeName}. It is listed in the shop only while approved (see Marketplace Review).</p>
      ) : (
        <label className="adm-check"><input type="checkbox" checked={f.active} onChange={set('active')} /> Visible in the shop</label>
      )}
      <ErrorNote error={Object.keys(er).length ? null : state.error} />
      <div className="adm-actions">
        <button className="btn-primary" disabled={state.busy}>{state.busy ? 'Saving…' : 'Save Product →'}</button>
        <button type="button" className="btn-outline" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

/** Approve or reject a seller's product, with a reason the seller sees. */
function ReviewPanel({ product, onDone }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const canApprove = product.status === 'PENDING_APPROVAL';
  const canReject = product.status === 'PENDING_APPROVAL' || product.status === 'APPROVED';

  const run = async (fn, message) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      ['admin', 'products', 'product', 'catalog', 'categories'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast(message);
      onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  const reject = (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError(new Error('Give a reason the seller will see.'));
      return;
    }
    run(() => api.admin.rejectProduct(product.id, reason.trim()),
      product.status === 'APPROVED' ? `${product.name} taken down` : `${product.name} rejected`);
  };

  return (
    <section className="od-card adm-review" aria-labelledby="adm-review-h">
      <h2 id="adm-review-h">🏪 Marketplace Review</h2>
      <p>Sold by <strong>{product.seller.storeName}</strong> · <StatusPill status={productState(product)} labels={PRODUCT_STATUS} /></p>
      {product.rejectionReason && <p className="co-muted">Reason given to the seller: {product.rejectionReason}</p>}
      {canApprove && (
        <div className="adm-actions">
          <button type="button" className="btn-primary btn-sm" disabled={busy}
            onClick={() => run(() => api.admin.approveProduct(product.id), `${product.name} approved and listed ✓`)}>✓ Approve &amp; List</button>
        </div>
      )}
      {canReject && (
        <form className="adm-status-form" onSubmit={reject} noValidate>
          <Field label={product.status === 'APPROVED' ? 'Reason for taking it down' : 'Reason for rejecting'} as="textarea" rows={2}
            maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} hint="The seller sees this and can fix the product." />
          <button className="btn-outline btn-sm" disabled={busy}>{product.status === 'APPROVED' ? 'Take Down' : '✕ Reject'}</button>
        </form>
      )}
      {!canApprove && !canReject && <p className="co-muted">Nothing to review: the seller hasn&apos;t submitted this product.</p>}
      {error && <div className="gg-alert gg-alert--error" role="alert">{error.message}</div>}
    </section>
  );
}

const OWNERS = { '': 'All sellers', platform: 'GiftGenius', marketplace: 'Marketplace sellers' };

export function AdminProducts() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const editParam = params.get('edit');
  const editing = editParam === null ? null : Number(editParam);
  const status = params.get('status') ?? '';
  const owner = params.get('owner') ?? '';
  const setEditing = (id) => {
    const next = new URLSearchParams(params);
    if (id === null) next.delete('edit');
    else next.set('edit', String(id));
    setParams(next);
  };
  const setFilter = (k) => (e) => {
    const next = new URLSearchParams(params);
    if (e.target.value) next.set(k, e.target.value);
    else next.delete(k);
    setParams(next, { replace: true });
    setPage(0);
  };

  const products = useQuery({
    queryKey: ['admin', 'products', q, status, owner, page],
    queryFn: () => api.admin.products({ q: q || undefined, status: status || undefined, owner: owner || undefined, page, size: 25 }),
    placeholderData: keepPreviousData,
  });
  const one = useQuery({
    queryKey: ['admin', 'product', editing],
    queryFn: () => api.admin.product(editing),
    enabled: editing !== null && editing !== 0,
  });

  if (editing !== null) {
    if (editing === 0) return <ProductForm product={null} onDone={() => setEditing(null)} />;
    if (one.isPending) return <Spinner />;
    if (one.error) return <ErrorNote error={one.error} onRetry={() => one.refetch()} />;
    const product = one.data;
    return (
      <>
        {product.seller && <ReviewPanel product={product} onDone={() => setEditing(null)} />}
        <ProductForm key={product.id} product={product} onDone={() => setEditing(null)} />
      </>
    );
  }

  return (
    <>
      <div className="adm-toolbar">
        <div className="search-wrap">
          <label htmlFor="adm-q" className="sr-only">Search products</label>
          <input id="adm-q" type="search" placeholder="Search products…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        <label htmlFor="adm-pstatus" className="sr-only">Review status</label>
        <select id="adm-pstatus" className="sort-select" value={status} onChange={setFilter('status')}>
          <option value="">All statuses</option>
          <option value="PENDING_APPROVAL">Awaiting approval</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="DRAFT">Drafts</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <label htmlFor="adm-owner" className="sr-only">Sold by</label>
        <select id="adm-owner" className="sort-select" value={owner} onChange={setFilter('owner')}>
          {Object.entries(OWNERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" className="btn-primary btn-sm" onClick={() => setEditing(0)}>+ New Product</button>
      </div>
      <ErrorNote error={products.error} onRetry={() => products.refetch()} />
      <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Products table">
        <table className="adm-table">
          <thead><tr><th><span className="sr-only">Photo</span></th><th>Product</th><th>Sold by</th><th>Category</th><th className="num">Price</th><th className="num">Stock</th><th>Review</th><th>Shop</th></tr></thead>
          <tbody>
            {products.isPending && <tr><td colSpan={8}><Spinner inline /></td></tr>}
            {products.data?.content.length === 0 && <tr><td colSpan={8} className="co-muted">No products here.</td></tr>}
            {products.data?.content.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'is-muted'}>
                <td className="adm-thumb"><SafeImg src={p.image} alt="" /></td>
                <td><button type="button" className="adm-link" onClick={() => setEditing(p.id)}>{p.name}</button></td>
                <td>{p.seller?.storeName ?? 'GiftGenius'}</td>
                <td>{p.category}</td>
                <td className="num">{inr(p.price)}</td>
                <td className={`num ${p.stock < 10 ? 'text-bad' : ''}`}>{p.stock}</td>
                <td><StatusPill status={p.status} labels={PRODUCT_STATUS} /></td>
                <td>{p.active ? 'Visible' : 'Hidden'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {products.data && <Pagination page={products.data.page} totalPages={products.data.totalPages} onChange={setPage} />}
    </>
  );
}

// ── Sellers ──────────────────────────────────────────────

export function AdminSellers() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const status = params.get('status') ?? '';
  const sellers = useQuery({
    queryKey: ['admin', 'sellers', status, q, page],
    queryFn: () => api.admin.sellers({ status: status || undefined, q: q || undefined, page, size: 25 }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div className="adm-toolbar">
        <div className="search-wrap">
          <label htmlFor="adm-sq" className="sr-only">Search sellers</label>
          <input id="adm-sq" type="search" placeholder="Store, name or email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        <label htmlFor="adm-sstatus" className="sr-only">Seller status</label>
        <select id="adm-sstatus" className="sort-select" value={status}
          onChange={(e) => { setParams(e.target.value ? { status: e.target.value } : {}, { replace: true }); setPage(0); }}>
          <option value="">All sellers</option>
          {Object.entries(SELLER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <ErrorNote error={sellers.error} onRetry={() => sellers.refetch()} />
      <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Sellers table">
        <table className="adm-table">
          <thead><tr><th>Store</th><th>Seller</th><th>Email</th><th>Status</th><th className="num">Products</th><th className="num">Orders</th><th className="num">Revenue</th><th>Joined</th></tr></thead>
          <tbody>
            {sellers.isPending && <tr><td colSpan={8}><Spinner inline /></td></tr>}
            {sellers.data?.content.length === 0 && <tr><td colSpan={8} className="co-muted">No sellers here.</td></tr>}
            {sellers.data?.content.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/admin/sellers/${s.id}`} className="adm-link">{s.storeName}</Link></td>
                <td>{s.sellerName}</td>
                <td>{s.email}</td>
                <td><StatusPill status={s.status} labels={SELLER_STATUS} /></td>
                <td className="num">{s.productCount}{s.pendingProducts > 0 ? ` (${s.pendingProducts} to review)` : ''}</td>
                <td className="num">{s.orderCount}</td>
                <td className="num">{inr(s.revenue)}</td>
                <td>{date(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sellers.data && <Pagination page={sellers.data.page} totalPages={sellers.data.totalPages} onChange={setPage} />}
    </>
  );
}

/** Approve, reject, suspend or reactivate a store. Rejecting and suspending need a reason the seller sees. */
function SellerActions({ seller, onChanged }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const status = seller.store.status;

  const run = async (fn, message, needsReason) => {
    if (needsReason && !reason.trim()) {
      setError(new Error('Give a reason the seller will see.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChanged(await fn());
      toast(message);
      setReason('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const needsReasonField = status === 'PENDING' || status === 'APPROVED';

  return (
    <div className="adm-status-form">
      {needsReasonField && (
        <Field label={status === 'APPROVED' ? 'Reason for suspending' : 'Reason (needed to reject)'} as="textarea" rows={2} maxLength={500}
          value={reason} onChange={(e) => setReason(e.target.value)} hint="The seller sees this reason." />
      )}
      <div className="adm-actions">
        {(status === 'PENDING' || status === 'REJECTED') && (
          <button type="button" className="btn-primary btn-sm" disabled={busy}
            onClick={() => run(() => api.admin.approveSeller(seller.id), `${seller.store.storeName} approved ✓`)}>✓ Approve Store</button>
        )}
        {status === 'PENDING' && (
          <button type="button" className="btn-outline btn-sm" disabled={busy}
            onClick={() => run(() => api.admin.rejectSeller(seller.id, reason.trim()), `${seller.store.storeName} rejected`, true)}>✕ Reject</button>
        )}
        {status === 'APPROVED' && (
          <button type="button" className="btn-outline btn-sm sel-danger" disabled={busy}
            onClick={() => run(() => api.admin.suspendSeller(seller.id, reason.trim()), `${seller.store.storeName} suspended`, true)}>Suspend Store</button>
        )}
        {status === 'SUSPENDED' && (
          <button type="button" className="btn-primary btn-sm" disabled={busy}
            onClick={() => run(() => api.admin.reactivateSeller(seller.id), `${seller.store.storeName} reactivated ✓`)}>Reactivate Store</button>
        )}
      </div>
      {error && <div className="gg-alert gg-alert--error" role="alert">{error.message}</div>}
    </div>
  );
}

export function AdminSellerDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ['admin', 'seller', id], queryFn: () => api.admin.seller(id) });
  if (detail.isPending) return <Spinner />;
  if (detail.error) {
    return detail.error.status === 404
      ? <EmptyState icon="🏪" title="Seller not found" action={<Link to="/admin/sellers" className="btn-primary">All Sellers →</Link>} />
      : <ErrorNote error={detail.error} onRetry={() => detail.refetch()} />;
  }
  const d = detail.data;
  const st = d.store;
  const changed = (next) => {
    qc.setQueryData(['admin', 'seller', id], next);
    ['sellers', 'products', 'stats'].forEach((k) => qc.invalidateQueries({ queryKey: ['admin', k] }));
    qc.invalidateQueries({ queryKey: ['products'] });
  };
  return (
    <>
      <Link to="/admin/sellers" className="co-continue">← All sellers</Link>
      <section className="od-card" aria-labelledby="adm-seller-h">
        <div className="sel-card-head">
          <h2 id="adm-seller-h">🏪 {st.storeName}</h2>
          <StatusPill status={st.status} labels={SELLER_STATUS} />
        </div>
        {st.statusReason && <Notice tone="warn">Reason given: {st.statusReason}</Notice>}
        <SellerActions seller={d} onChanged={changed} />
        <dl className="sel-facts">
          <div><dt>Seller</dt><dd>{d.sellerName}</dd></div>
          <div><dt>Email</dt><dd><a href={`mailto:${d.email}`}>{d.email}</a></dd></div>
          <div><dt>Store phone</dt><dd>{st.phone}</dd></div>
          <div><dt>Category</dt><dd>{titleCase(st.businessCategory)}</dd></div>
          <div><dt>Address</dt><dd>{st.addressLine}, {st.city}, {st.state} {st.pincode}</dd></div>
          <div><dt>Support email</dt><dd>{st.supportEmail ?? '—'}</dd></div>
          <div><dt>Store page</dt><dd>{st.status === 'APPROVED' ? <Link to={`/store/${st.slug}`}>/store/{st.slug}</Link> : `/store/${st.slug}`}</dd></div>
          <div><dt>Applied</dt><dd>{date(st.createdAt)}{st.reviewedAt ? ` · last reviewed ${date(st.reviewedAt)}` : ''}</dd></div>
          <div><dt>Account</dt><dd>{d.accountEnabled ? 'Active' : 'Blocked'}</dd></div>
        </dl>
        {st.description && <p className="adm-drawer-text">{st.description}</p>}
      </section>

      <div className="adm-kpis">
        <div className="adm-kpi"><span>Products</span><strong>{d.stats.totalProducts}</strong></div>
        <div className="adm-kpi"><span>Listed</span><strong>{d.stats.listedProducts}</strong></div>
        <div className="adm-kpi"><span>Awaiting approval</span><strong>{d.stats.pendingProducts}</strong></div>
        <div className="adm-kpi"><span>Orders</span><strong>{d.stats.orders}</strong></div>
        <div className="adm-kpi"><span>Gross sales</span><strong>{inr(d.stats.grossSales)}</strong></div>
      </div>

      <section className="od-card" aria-labelledby="adm-seller-products">
        <h2 id="adm-seller-products">🎁 Products</h2>
        {d.products.length === 0 ? <p className="co-muted">No products yet.</p> : (
          <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Seller products">
            <table className="adm-table">
              <thead><tr><th>Product</th><th className="num">Price</th><th className="num">Stock</th><th>Review</th><th>Updated</th></tr></thead>
              <tbody>
                {d.products.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/admin/products?edit=${p.id}`} className="adm-link">{p.name}</Link></td>
                    <td className="num">{inr(p.price)}</td>
                    <td className="num">{p.stock}</td>
                    <td><StatusPill status={productState(p)} labels={PRODUCT_STATUS} /></td>
                    <td>{date(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="od-card" aria-labelledby="adm-seller-orders">
        <h2 id="adm-seller-orders">📦 Recent Orders</h2>
        {d.recentOrders.length === 0 ? <p className="co-muted">No orders yet.</p> : (
          <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Seller orders">
            <table className="adm-table">
              <thead><tr><th>Order</th><th>Their items</th><th className="num">Their total</th><th>Their status</th><th>Order</th><th>Placed</th></tr></thead>
              <tbody>
                {d.recentOrders.map((o) => (
                  <tr key={o.orderNumber}>
                    <td>{o.orderNumber}</td>
                    <td>{orderItemsLabel(o)}</td>
                    <td className="num">{inr(o.sellerTotal)}</td>
                    <td><StatusPill status={o.fulfillmentStatus} labels={FULFILMENT_STATUS} /></td>
                    <td><StatusPill status={o.orderStatus} /></td>
                    <td>{date(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

const EMPTY_COUPON = { code: '', type: 'PERCENT', discountValue: '', minOrderAmount: '', maxDiscount: '', usageLimit: '', perUserLimit: '1', validUntil: '', active: true };

export function AdminCoupons() {
  const qc = useQueryClient();
  const toast = useToast();
  const coupons = useQuery({ queryKey: ['admin', 'coupons'], queryFn: api.admin.coupons });
  const [form, setForm] = useState(null);
  const [state, setState] = useState({ busy: false, error: null, errors: {} });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const num = (v) => (v === '' || v == null ? null : Number(v));

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: null, errors: {} });
    const body = {
      code: form.code, type: form.type, discountValue: num(form.discountValue), minOrderAmount: num(form.minOrderAmount),
      maxDiscount: num(form.maxDiscount), usageLimit: num(form.usageLimit), perUserLimit: num(form.perUserLimit),
      validFrom: form.validFrom || null, validUntil: form.validUntil ? new Date(`${form.validUntil}T23:59:59`).toISOString() : null,
      active: form.active,
    };
    try {
      if (form.id) await api.admin.updateCoupon(form.id, body);
      else await api.admin.createCoupon(body);
      qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      toast('Coupon saved ✓');
      setForm(null);
      setState({ busy: false, error: null, errors: {} });
    } catch (err) {
      setState({ busy: false, error: err, errors: err.errors || {} });
    }
  };

  if (form) {
    const er = state.errors;
    return (
      <form className="co-form-section" onSubmit={save}>
        <h2>{form.id ? `✏️ Edit ${form.code}` : '➕ New Coupon'}</h2>
        <div className="co-form-row">
          <Field label="Code" required disabled={!!form.id} pattern="[A-Za-z0-9_\-]{3,40}" value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} error={er.code} />
          <Field label="Type" as="select" value={form.type} onChange={set('type')}>
            <option value="PERCENT">Percent off</option>
            <option value="FLAT">Flat ₹ off</option>
          </Field>
        </div>
        <div className="co-form-row co-form-row--3">
          <Field label={form.type === 'PERCENT' ? 'Percent Off' : 'Amount Off (₹)'} required type="number" min="0.01" step="0.01"
            value={form.discountValue} onChange={set('discountValue')} error={er.discountValue} />
          <Field label="Max Discount (₹)" type="number" min="0" value={form.maxDiscount ?? ''} onChange={set('maxDiscount')} />
          <Field label="Minimum Order (₹)" type="number" min="0" value={form.minOrderAmount ?? ''} onChange={set('minOrderAmount')} />
        </div>
        <div className="co-form-row co-form-row--3">
          <Field label="Total Uses" type="number" min="1" value={form.usageLimit ?? ''} onChange={set('usageLimit')} hint="Blank = unlimited" />
          <Field label="Uses per Customer" type="number" min="1" value={form.perUserLimit ?? ''} onChange={set('perUserLimit')} hint="Blank = unlimited" />
          <Field label="Valid Until" type="date" value={form.validUntil ?? ''} onChange={set('validUntil')} />
        </div>
        <label className="adm-check"><input type="checkbox" checked={form.active} onChange={set('active')} /> Active</label>
        <ErrorNote error={Object.keys(er).length ? null : state.error} />
        <div className="adm-actions">
          <button className="btn-primary" disabled={state.busy}>{state.busy ? 'Saving…' : 'Save Coupon →'}</button>
          <button type="button" className="btn-outline" onClick={() => setForm(null)}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="adm-toolbar"><button type="button" className="btn-primary btn-sm" onClick={() => setForm(EMPTY_COUPON)}>+ New Coupon</button></div>
      {coupons.isPending && <Spinner />}
      <ErrorNote error={coupons.error} />
      {coupons.data && (
        <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Coupons table">
          <table className="adm-table">
            <thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th className="num">Used</th><th>Per customer</th><th>Expires</th><th>Status</th></tr></thead>
            <tbody>
              {coupons.data.map((c) => (
                <tr key={c.id} className={c.active ? '' : 'is-muted'}>
                  <td><button type="button" className="adm-link" onClick={() => setForm({ ...c, validUntil: c.validUntil ? c.validUntil.slice(0, 10) : '' })}>{c.code}</button></td>
                  <td>{c.type === 'PERCENT' ? `${Number(c.discountValue)}%${c.maxDiscount ? ` (max ${inr(c.maxDiscount)})` : ''}` : inr(c.discountValue)}</td>
                  <td>{Number(c.minOrderAmount) ? inr(c.minOrderAmount) : '—'}</td>
                  <td className="num">{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                  <td>{c.perUserLimit ?? 'Unlimited'}</td>
                  <td>{c.validUntil ? date(c.validUntil) : 'Never'}</td>
                  <td>{c.active ? 'Active' : 'Off'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const TOPIC_LABEL = { general: 'General', order: 'Order help', bulk: 'Bulk order', partnership: 'Partnership' };

export function AdminMessages() {
  const qc = useQueryClient();
  const toast = useToast();
  const [showHandled, setShowHandled] = useState(false);
  const [page, setPage] = useState(0);
  const messages = useQuery({
    queryKey: ['admin', 'messages', showHandled, page],
    queryFn: () => api.admin.messages({ handled: showHandled ? undefined : false, page, size: 20 }),
    placeholderData: keepPreviousData,
  });
  const mark = async (m) => {
    try {
      await api.admin.markMessageHandled(m.id, !m.handled);
      qc.invalidateQueries({ queryKey: ['admin', 'messages'] });
      toast(m.handled ? 'Marked as open' : 'Marked as handled ✓');
    } catch (err) {
      toast(err.message, 'bad');
    }
  };
  return (
    <>
      <div className="adm-toolbar">
        <label className="adm-check"><input type="checkbox" checked={showHandled} onChange={(e) => { setShowHandled(e.target.checked); setPage(0); }} /> Show handled messages</label>
      </div>
      {messages.isPending && <Spinner />}
      <ErrorNote error={messages.error} />
      {messages.data?.content.length === 0 && <p className="co-muted">No {showHandled ? '' : 'open '}messages. 🎉</p>}
      <div className="adm-messages">
        {messages.data?.content.map((m) => (
          <article key={m.id} className={`od-card adm-message ${m.handled ? 'is-muted' : ''}`}>
            <header>
              <div>
                <strong>{m.name}</strong> · <a href={`mailto:${m.email}`}>{m.email}</a>
                <div className="co-muted">{TOPIC_LABEL[m.topic] ?? m.topic}{m.orderNumber ? ` · ${m.orderNumber}` : ''} · {dateTime(m.createdAt)}</div>
              </div>
              <button type="button" className="btn-outline btn-sm" onClick={() => mark(m)}>{m.handled ? 'Reopen' : '✓ Mark handled'}</button>
            </header>
            <p>{m.message}</p>
          </article>
        ))}
      </div>
      {messages.data && <Pagination page={messages.data.page} totalPages={messages.data.totalPages} onChange={setPage} />}
    </>
  );
}
