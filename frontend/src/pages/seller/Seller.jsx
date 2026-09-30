import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import SafeImg from '../../components/SafeImg.jsx';
import StoreFormFields from '../../components/StoreForm.jsx';
import { storeErrors, validateStore } from '../../components/AuthCard.jsx';
import { RequireSeller } from '../../components/guards.jsx';
import { EmptyState, Field, Notice, PageHero, Pagination, StatusPill } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { api } from '../../lib/api.js';
import { date, dateTime, inr, orderItemsLabel, titleCase } from '../../lib/format.js';
import {
  FULFILMENT_STATUS, PRODUCT_STATUS, SELLER_CATEGORIES, SELLER_OCCASIONS, SELLER_STATUS, productState,
} from '../../lib/marketplace.js';

// ── Shared pieces ──────────────────────────────────────

const useStore = () => useQuery({ queryKey: ['seller', 'me'], queryFn: api.seller.me });
/** A store waiting for review or approved can add and change products (the API enforces the same rule). */
const canEditProducts = (status) => status === 'APPROVED' || status === 'PENDING';

/** Loading placeholder shaped like the content, announced once to screen readers. */
function Skeleton({ kpis = 0, lines = 4, label = 'Loading…' }) {
  return (
    <div className="sel-skel" role="status">
      <span className="sr-only">{label}</span>
      {kpis > 0 && <div className="adm-kpis" aria-hidden="true">{Array.from({ length: kpis }, (_, i) => <div key={i} className="sel-skel-kpi" />)}</div>}
      <div className="od-card" aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => <div key={i} className="sel-skel-line" style={{ width: `${90 - i * 12}%` }} />)}
      </div>
    </div>
  );
}

/** "Unable to load …" with a retry, never the raw error. */
function LoadError({ what, error, onRetry }) {
  const offline = error?.status === 0;
  return (
    <div className="gg-alert gg-alert--error" role="alert">
      <span>Unable to load {what}.{offline ? ' Check your connection and try again.' : ''}</span>
      <button type="button" className="btn-outline btn-sm" onClick={onRetry}>↻ Retry</button>
    </div>
  );
}

/** Explains what the store can do while it isn't approved. Nothing is shown for an approved store. */
function StoreStatusNotice({ store }) {
  if (!store || store.status === 'APPROVED') return null;
  if (store.status === 'PENDING') {
    return (
      <Notice tone="warn" role="status">
        <strong>Your store is waiting for approval.</strong> GiftGenius reviews every new store. Meanwhile you can prepare
        products as drafts; you can submit them for approval once your store is approved.
      </Notice>
    );
  }
  if (store.status === 'REJECTED') {
    return (
      <Notice tone="error" role="status">
        <strong>Your store wasn&apos;t approved.</strong> {store.statusReason ? <>Reason: {store.statusReason} </> : null}
        Update your details in <Link to="/seller/settings">Store Settings</Link> and apply again.
      </Notice>
    );
  }
  return (
    <Notice tone="error" role="status">
      <strong>Your store is suspended</strong> and its products are hidden from the shop.
      {store.statusReason ? <> Reason: {store.statusReason}.</> : null} Please <Link to="/contact">contact GiftGenius support</Link>.
    </Notice>
  );
}

const TABS = [
  ['/seller', '📊 Dashboard', true],
  ['/seller/products', '🎁 My Products'],
  ['/seller/orders', '📦 Orders'],
  ['/seller/analytics', '📈 Analytics'],
  ['/seller/settings', '⚙️ Store Settings'],
];

export function SellerLayout() {
  useDocumentTitle('Seller Center');
  return (
    <RequireSeller>
      <SellerShell />
    </RequireSeller>
  );
}

function SellerShell() {
  const store = useStore();
  return (
    <>
      <PageHero eyebrow="Seller Center" title={store.data?.storeName ?? 'Your'} em={store.data ? undefined : 'Store'}>
        Your products, orders and sales on GiftGenius.
      </PageHero>
      <div className="adm-page sel-page">
        <nav className="adm-tabs" aria-label="Seller Center sections">
          {TABS.map(([to, label, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
        </nav>
        <StoreStatusNotice store={store.data} />
        <Outlet />
      </div>
    </>
  );
}

// ── Dashboard ──────────────────────────────────────────

function Kpi({ label, value, to, note }) {
  const body = <><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</>;
  return to ? <Link to={to} className="adm-kpi adm-kpi--link">{body}</Link> : <div className="adm-kpi">{body}</div>;
}

function RecentOrders({ orders }) {
  if (orders.length === 0) return <p className="co-muted">No orders yet. Orders appear here once shoppers buy your products.</p>;
  return (
    <ul className="sel-list">
      {orders.map((o) => (
        <li key={o.orderNumber}>
          <SafeImg src={o.firstItemImage} alt="" />
          <div>
            <Link to={`/seller/orders/${o.orderNumber}`} className="sel-list-title">{o.orderNumber}</Link>
            <small>{orderItemsLabel(o)} · {date(o.createdAt)}</small>
          </div>
          <div className="sel-list-side">
            <strong>{inr(o.sellerTotal)}</strong>
            <StatusPill status={o.fulfillmentStatus} labels={FULFILMENT_STATUS} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecentProducts({ products, canEdit }) {
  if (products.length === 0) {
    return (
      <div className="sel-empty">
        <p><strong>No products yet.</strong> {canEdit ? 'Add your first product to start selling.' : "Your store can't add products right now."}</p>
        {canEdit && <Link to="/seller/products/new" className="btn-primary btn-sm">+ Add Product</Link>}
      </div>
    );
  }
  return (
    <ul className="sel-list">
      {products.map((p) => (
        <li key={p.id}>
          <SafeImg src={p.image} alt="" />
          <div>
            <Link to={`/seller/products/${p.id}/edit`} className="sel-list-title">{p.name}</Link>
            <small>{inr(p.price)} · {p.stock} in stock</small>
          </div>
          <div className="sel-list-side"><StatusPill status={productState(p)} labels={PRODUCT_STATUS} /></div>
        </li>
      ))}
    </ul>
  );
}

export function SellerDashboard() {
  useDocumentTitle('Seller Dashboard');
  const dash = useQuery({ queryKey: ['seller', 'dashboard'], queryFn: api.seller.dashboard });
  if (dash.isPending) return <Skeleton kpis={6} label="Loading your dashboard…" />;
  if (dash.error) return <LoadError what="your dashboard" error={dash.error} onRetry={() => dash.refetch()} />;
  const { store, stats, recentOrders, recentProducts } = dash.data;
  const canEdit = canEditProducts(store.status);
  return (
    <>
      <section className="sel-head" aria-labelledby="sel-dash-h">
        <div>
          <h2 id="sel-dash-h" className="sel-h">{store.storeName}</h2>
          <p className="co-muted">Store status: <StatusPill status={store.status} labels={SELLER_STATUS} /></p>
        </div>
        <div className="adm-actions">
          {canEdit && <Link to="/seller/products/new" className="btn-primary btn-sm">+ Add Product</Link>}
          <Link to="/seller/products" className="btn-outline btn-sm">Manage Products</Link>
          <Link to="/seller/orders" className="btn-outline btn-sm">Orders</Link>
          <Link to="/seller/settings" className="btn-outline btn-sm">Store Settings</Link>
          {store.status === 'APPROVED' && <Link to={`/store/${store.slug}`} className="btn-outline btn-sm">View My Store ↗</Link>}
        </div>
      </section>

      <div className="adm-kpis">
        <Kpi label="Total products" value={stats.totalProducts} to="/seller/products" />
        <Kpi label="Listed in the shop" value={stats.listedProducts} to="/seller/products?status=APPROVED" />
        <Kpi label="Awaiting approval" value={stats.pendingProducts} to="/seller/products?status=PENDING_APPROVAL" />
        <Kpi label="Orders" value={stats.orders} to="/seller/orders" note={stats.ordersToFulfil ? `${stats.ordersToFulfil} to pack or ship` : null} />
        <Kpi label="Units sold" value={stats.unitsSold} />
        <Kpi label="Revenue" value={inr(stats.grossSales)} to="/seller/analytics" note="Sales, before coupons" />
      </div>

      <div className="sel-grid">
        <section className="od-card" aria-labelledby="sel-recent-orders">
          <div className="sel-card-head">
            <h2 id="sel-recent-orders">📦 Recent Orders</h2>
            {recentOrders.length > 0 && <Link to="/seller/orders">All orders →</Link>}
          </div>
          <RecentOrders orders={recentOrders} />
        </section>
        <section className="od-card" aria-labelledby="sel-recent-products">
          <div className="sel-card-head">
            <h2 id="sel-recent-products">🎁 Recent Products</h2>
            {recentProducts.length > 0 && <Link to="/seller/products">All products →</Link>}
          </div>
          <RecentProducts products={recentProducts} canEdit={canEdit} />
        </section>
      </div>
    </>
  );
}

// ── Products ───────────────────────────────────────────

const STATUS_FILTERS = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'OUT_OF_STOCK', 'REJECTED', 'ARCHIVED'];
const SORTS = { newest: 'Newest first', oldest: 'Oldest first', name: 'Name A–Z', price_asc: 'Price: low to high', price_desc: 'Price: high to low', stock: 'Lowest stock' };

export function SellerProducts() {
  useDocumentTitle('My Products');
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const status = params.get('status') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const store = useStore();
  const products = useQuery({
    queryKey: ['seller', 'products', q, status, category, sort, page],
    queryFn: () => api.seller.products({ q: q || undefined, status: status || undefined, category: category || undefined, sort, page, size: 20 }),
    placeholderData: keepPreviousData,
  });
  const setFilter = (k) => (e) => {
    const next = new URLSearchParams(params);
    if (e.target.value) next.set(k, e.target.value);
    else next.delete(k);
    setParams(next, { replace: true });
    setPage(0);
  };
  const canSubmit = store.data?.status === 'APPROVED';
  const canEdit = canEditProducts(store.data?.status);
  const filtered = !!(q || status || category);

  const act = async (fn, done) => {
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ['seller'] });
      toast(done);
    } catch (err) {
      toast(err.message, 'bad');
    }
  };
  const archive = (p) => {
    if (!window.confirm(`Remove "${p.name}" from sale? It is archived: past orders keep it, and you can submit it again later.`)) return;
    act(() => api.seller.archiveProduct(p.id), `${p.name} archived`);
  };

  return (
    <>
      <div className="adm-toolbar">
        <div className="search-wrap">
          <label htmlFor="sel-q" className="sr-only">Search your products</label>
          <input id="sel-q" type="search" placeholder="Search your products…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        <label htmlFor="sel-status" className="sr-only">Status</label>
        <select id="sel-status" className="sort-select" value={status} onChange={setFilter('status')}>
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{PRODUCT_STATUS[s].label}</option>)}
        </select>
        <label htmlFor="sel-category" className="sr-only">Category</label>
        <select id="sel-category" className="sort-select" value={category} onChange={setFilter('category')}>
          <option value="">All categories</option>
          {SELLER_CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
        </select>
        <label htmlFor="sel-sort" className="sr-only">Sort</label>
        <select id="sel-sort" className="sort-select" value={sort} onChange={setFilter('sort')}>
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {canEdit && <Link to="/seller/products/new" className="btn-primary btn-sm">+ Add Product</Link>}
      </div>

      {products.isPending && <Skeleton lines={5} label="Loading your products…" />}
      {products.error && <LoadError what="your products" error={products.error} onRetry={() => products.refetch()} />}
      {products.data?.content.length === 0 && (filtered ? (
        <p className="co-muted">No products match these filters.</p>
      ) : (
        <EmptyState icon="🎁" title="No products yet."
          action={canEdit ? <Link to="/seller/products/new" className="btn-primary">+ Add Your First Product</Link> : null}>
          {canEdit ? 'Add your first product to start selling.' : "Your store can't add products right now."}
        </EmptyState>
      ))}
      {products.data?.content.length > 0 && (
        <div className={`adm-table-wrap sel-table-wrap ${products.isPlaceholderData ? 'is-stale' : ''}`} role="region" aria-label="Your products" tabIndex={0}>
          <table className="adm-table sel-table">
            <thead>
              <tr><th><span className="sr-only">Photo</span></th><th>Product</th><th>Category</th><th className="num">Price</th>
                <th className="num">Stock</th><th>Status</th><th>Created</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {products.data.content.map((p) => {
                const state = productState(p);
                const submittable = ['DRAFT', 'REJECTED', 'ARCHIVED'].includes(p.status);
                return (
                  <tr key={p.id}>
                    <td className="adm-thumb"><SafeImg src={p.image} alt="" /></td>
                    <td data-label="Product">
                      <Link to={`/seller/products/${p.id}/edit`} className="adm-link">{p.name}</Link>
                      {p.rejectionReason && <small className="sel-reason">Rejected: {p.rejectionReason}</small>}
                    </td>
                    <td data-label="Category">{titleCase(p.category)}</td>
                    <td data-label="Price" className="num">{inr(p.price)}</td>
                    <td data-label="Stock" className={`num ${p.stock === 0 ? 'text-bad' : ''}`}>{p.stock}</td>
                    <td data-label="Status"><StatusPill status={state} labels={PRODUCT_STATUS} /></td>
                    <td data-label="Created">{date(p.createdAt)}</td>
                    <td className="sel-row-actions">
                      <Link to={`/seller/products/${p.id}/edit`} className="btn-outline btn-sm" aria-label={`Edit ${p.name}`}>Edit</Link>
                      {p.active && <Link to={`/product/${p.id}`} className="btn-outline btn-sm" aria-label={`View ${p.name} in the shop`}>View</Link>}
                      {submittable && canSubmit && (
                        <button type="button" className="btn-outline btn-sm" aria-label={`Submit ${p.name} for approval`}
                          onClick={() => act(() => api.seller.submitProduct(p.id), `${p.name} sent for approval`)}>Submit</button>
                      )}
                      {canEdit && p.status !== 'ARCHIVED' && (
                        <button type="button" className="btn-outline btn-sm sel-danger" aria-label={`Archive ${p.name}`} onClick={() => archive(p)}>Archive</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {products.data && <Pagination page={products.data.page} totalPages={products.data.totalPages} onChange={setPage} />}
    </>
  );
}

// ── Add / edit product ─────────────────────────────────

const EMPTY_PRODUCT = {
  name: '', description: '', longDescription: '', category: '', occasion: [], tags: '', price: '', compareAtPrice: '',
  stock: '', image: '', alt: '',
};
const MARKUP = /[<>]/;
const HTTPS_URL = /^https:\/\/[^\s<>"'`]{4,990}$/;
const TAG = /^[A-Za-z0-9 &-]*$/;
const tagList = (s) => s.split(',').map((t) => t.trim()).filter(Boolean);

const toProductForm = (p) => ({
  name: p.name, description: p.description, longDescription: p.longDescription ?? '', category: p.category,
  occasion: p.occasion ?? [], tags: (p.tags ?? []).join(', '), price: String(p.price),
  compareAtPrice: Number(p.originalPrice) > Number(p.price) ? String(p.originalPrice) : '', stock: String(p.stock),
  image: p.image, alt: p.alt && p.alt !== p.name ? p.alt : '',
});

/** The API's product rules, checked before sending. Returns { field: message }. */
export function validateProduct(f) {
  const e = {};
  const name = f.name.trim();
  if (!name) e.name = 'Enter the product name.';
  else if (name.length < 3 || name.length > 150) e.name = 'Use 3 to 150 characters.';
  const desc = f.description.trim();
  if (!desc) e.description = 'Enter a short description.';
  else if (desc.length < 10 || desc.length > 500) e.description = 'Use 10 to 500 characters.';
  if (f.longDescription.length > 5000) e.longDescription = 'Use at most 5000 characters.';
  if (!f.category) e.category = 'Choose a category.';
  const price = Number(f.price);
  if (f.price === '' || Number.isNaN(price)) e.price = 'Enter the price.';
  else if (price < 1 || price > 1_000_000) e.price = 'Use a price from ₹1 to ₹10,00,000.';
  else if (Math.round(price * 100) !== price * 100) e.price = 'Use at most 2 decimal places.';
  if (f.compareAtPrice !== '') {
    const cmp = Number(f.compareAtPrice);
    if (Number.isNaN(cmp) || cmp < 1 || cmp > 1_000_000) e.compareAtPrice = 'Use a price from ₹1 to ₹10,00,000.';
    else if (!e.price && cmp < price) e.compareAtPrice = "The compare-at price can't be lower than the price.";
  }
  const stock = Number(f.stock);
  if (f.stock === '' || !Number.isInteger(stock)) e.stock = 'Enter the stock as a whole number.';
  else if (stock < 0 || stock > 100_000) e.stock = 'Use 0 to 100000.';
  if (!f.image.trim()) e.image = 'Add an image link.';
  else if (!HTTPS_URL.test(f.image.trim())) e.image = 'Use an image link that starts with https://';
  const tags = tagList(f.tags);
  if (tags.length > 10) e.tags = 'Use at most 10 tags.';
  else if (tags.some((t) => t.length > 30 || !TAG.test(t))) e.tags = 'Tags can use letters, numbers, spaces, & and - (up to 30 characters each).';
  ['name', 'description', 'longDescription', 'alt'].forEach((k) => {
    if (!e[k] && MARKUP.test(f[k])) e[k] = 'Remove the < and > characters.';
  });
  return e;
}

const productBody = (f, submit) => ({
  name: f.name.trim(), description: f.description.trim(), longDescription: f.longDescription.trim() || null,
  category: f.category, occasion: f.occasion, tags: tagList(f.tags), price: Number(f.price),
  compareAtPrice: f.compareAtPrice === '' ? null : Number(f.compareAtPrice), stock: Number(f.stock),
  image: f.image.trim(), alt: f.alt.trim() || null, submit,
});

export function SellerProductEditor() {
  const { id } = useParams();
  const editing = id !== undefined;
  useDocumentTitle(editing ? 'Edit Product' : 'Add Product');
  const product = useQuery({ queryKey: ['seller', 'product', id], queryFn: () => api.seller.product(id), enabled: editing });
  const store = useStore();

  // Wait for the store too: what the seller may do (save drafts, submit) depends on its status.
  if ((editing && product.isPending) || store.isPending) return <Skeleton lines={6} label="Loading the product…" />;
  if (editing && product.error) {
    if (product.error.status === 403 || product.error.status === 404) {
      return (
        <EmptyState icon="🔒" title={product.error.status === 403 ? 'Not your product' : 'Product not found'}
          action={<Link to="/seller/products" className="btn-primary">Back to My Products →</Link>}>
          {product.error.status === 403 ? 'You can only manage your own products.' : 'It may have been removed.'}
        </EmptyState>
      );
    }
    return <LoadError what="the product" error={product.error} onRetry={() => product.refetch()} />;
  }
  return <ProductEditorForm key={id ?? 'new'} product={editing ? product.data : null} store={store.data} />;
}

function ProductEditorForm({ product, store }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState(() => (product ? toProductForm(product) : EMPTY_PRODUCT));
  const [state, setState] = useState({ busy: null, error: null, errors: {} });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggleOccasion = (o) => setF((x) => ({ ...x, occasion: x.occasion.includes(o) ? x.occasion.filter((v) => v !== o) : [...x.occasion, o] }));
  const storeStatus = store?.status;
  const canEdit = !store || canEditProducts(storeStatus);
  const canSubmit = storeStatus === 'APPROVED';
  const approved = product?.status === 'APPROVED';

  const save = async (submit) => {
    const errors = validateProduct(f);
    if (Object.keys(errors).length) {
      setState({ busy: null, error: null, errors });
      setTimeout(() => document.querySelector('.sel-editor [aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setState({ busy: submit ? 'submit' : 'save', error: null, errors: {} });
    try {
      const body = productBody(f, submit);
      const saved = product ? await api.seller.updateProduct(product.id, body) : await api.seller.createProduct(body);
      qc.invalidateQueries({ queryKey: ['seller'] });
      ['product', 'products', 'catalog'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast(saved.status === 'PENDING_APPROVAL' ? `${saved.name} sent for approval ✓`
        : saved.status === 'APPROVED' ? `${saved.name} saved ✓ The shop shows your changes.` : `${saved.name} saved as a draft ✓`);
      navigate('/seller/products');
    } catch (err) {
      setState({ busy: null, error: err, errors: err.errors || {} });
    }
  };

  const er = state.errors;
  const previewable = HTTPS_URL.test(f.image.trim());
  return (
    <form className="co-form-section sel-editor" noValidate onSubmit={(e) => { e.preventDefault(); save(canSubmit && !approved); }}>
      <div className="sel-card-head">
        <h2>{product ? `✏️ Edit: ${product.name}` : '➕ Add Product'}</h2>
        {product && <StatusPill status={productState(product)} labels={PRODUCT_STATUS} />}
      </div>
      {product?.rejectionReason && (
        <Notice tone="error"><strong>Not approved:</strong> {product.rejectionReason} Make the changes below and submit it again.</Notice>
      )}
      {product?.status === 'PENDING_APPROVAL' && <Notice>This product is waiting for approval. You can still change it.</Notice>}
      {approved && (
        <Notice>Price, compare-at price, stock, tags and occasions update in the shop straight away. Changing the name,
          descriptions, category, image or image description sends the product back for approval, and it leaves the
          shop until then.</Notice>
      )}
      {!canEdit && <Notice tone="error">Your store can&apos;t add or change products right now.</Notice>}

      <fieldset className="sel-fieldset" disabled={!canEdit}>
        <legend>Basic information</legend>
        <div className="co-form-row full">
          <Field label="Product Name" required maxLength={150} value={f.name} onChange={set('name')} error={er.name} />
        </div>
        <div className="co-form-row full">
          <Field label="Short Description" required as="textarea" rows={2} maxLength={500} value={f.description} onChange={set('description')}
            error={er.description} hint={`${f.description.length}/500 · shown on product cards`} />
        </div>
        <div className="co-form-row full">
          <Field label="Full Description (optional)" as="textarea" rows={5} maxLength={5000} value={f.longDescription}
            onChange={set('longDescription')} error={er.longDescription} hint="Materials, size, care, what's in the box. Plain text." />
        </div>
        <div className="co-form-row">
          <Field label="Category" as="select" required value={f.category} onChange={set('category')} error={er.category}>
            <option value="">Choose a category…</option>
            {SELLER_CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
          </Field>
          <Field label="Tags (optional, comma-separated)" value={f.tags} onChange={set('tags')} error={er.tags} hint="e.g. handmade, for-her, eco-friendly" />
        </div>
        <fieldset className="sel-occasions">
          <legend>Occasions (optional)</legend>
          <div className="sel-chips">
            {SELLER_OCCASIONS.map((o) => (
              <label key={o} className={`sel-chip ${f.occasion.includes(o) ? 'is-on' : ''}`}>
                <input type="checkbox" checked={f.occasion.includes(o)} onChange={() => toggleOccasion(o)} /> {titleCase(o)}
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <fieldset className="sel-fieldset" disabled={!canEdit}>
        <legend>Pricing &amp; stock</legend>
        <div className="co-form-row co-form-row--3">
          <Field label="Price (₹)" required type="number" inputMode="decimal" min="1" step="0.01" value={f.price} onChange={set('price')} error={er.price} />
          <Field label="Compare-at Price (₹, optional)" type="number" inputMode="decimal" min="1" step="0.01" value={f.compareAtPrice}
            onChange={set('compareAtPrice')} error={er.compareAtPrice} hint="The usual price, shown struck through" />
          <Field label="Stock" required type="number" inputMode="numeric" min="0" max="100000" step="1" value={f.stock} onChange={set('stock')} error={er.stock} />
        </div>
      </fieldset>

      <fieldset className="sel-fieldset" disabled={!canEdit}>
        <legend>Product image</legend>
        <div className="sel-image-row">
          <div className="sel-image-fields">
            <Field label="Image Link" required type="url" maxLength={1000} value={f.image} onChange={set('image')} error={er.image}
              hint="A https:// link to a photo of the product (JPG, PNG or WebP)" placeholder="https://" />
            <Field label="Image Description (optional)" maxLength={255} value={f.alt} onChange={set('alt')} error={er.alt}
              hint="What the photo shows, for shoppers using screen readers" />
          </div>
          <div className="sel-image-preview" aria-hidden="true">{previewable ? <SafeImg key={f.image.trim()} src={f.image.trim()} alt="" /> : <span>🖼️</span>}</div>
        </div>
      </fieldset>

      {state.error && !Object.keys(er).length && <div className="gg-alert gg-alert--error" role="alert">{state.error.message}</div>}
      {canEdit && (
        <div className="adm-actions">
          {canSubmit && !approved && (
            <button type="button" className="btn-primary" disabled={!!state.busy} onClick={() => save(true)}>
              {state.busy === 'submit' ? 'Submitting…' : 'Submit for Approval →'}
            </button>
          )}
          <button type="button" className={canSubmit && !approved ? 'btn-outline' : 'btn-primary'} disabled={!!state.busy} onClick={() => save(false)}>
            {state.busy === 'save' ? 'Saving…' : approved ? 'Save Changes →' : 'Save as Draft'}
          </button>
          <Link to="/seller/products" className="btn-outline">Cancel</Link>
        </div>
      )}
      {!canSubmit && canEdit && <p className="co-muted">You can submit products for approval once your store is approved.</p>}
    </form>
  );
}

// ── Orders ─────────────────────────────────────────────

export function SellerOrders() {
  useDocumentTitle('Seller Orders');
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const status = params.get('status') ?? '';
  const orders = useQuery({
    queryKey: ['seller', 'orders', status, page],
    queryFn: () => api.seller.orders({ status: status || undefined, page, size: 20 }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div className="adm-toolbar">
        <label htmlFor="sel-ostatus" className="sr-only">Fulfilment status</label>
        <select id="sel-ostatus" className="sort-select" value={status}
          onChange={(e) => { setParams(e.target.value ? { status: e.target.value } : {}, { replace: true }); setPage(0); }}>
          <option value="">All orders</option>
          {Object.entries(FULFILMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button type="button" className="btn-outline btn-sm" onClick={() => orders.refetch()}>↻ Refresh</button>
      </div>
      <p className="co-muted sel-fine">You see only your own products in each order, with what you need to deliver them.</p>
      {orders.isPending && <Skeleton lines={5} label="Loading your orders…" />}
      {orders.error && <LoadError what="your orders" error={orders.error} onRetry={() => orders.refetch()} />}
      {orders.data?.content.length === 0 && (
        <EmptyState icon="📦" title={status ? 'No orders here.' : 'No orders yet.'}>
          {status ? 'Try another status.' : 'Orders appear here once shoppers buy your products.'}
        </EmptyState>
      )}
      {orders.data?.content.length > 0 && (
        <div className={`adm-table-wrap sel-table-wrap ${orders.isPlaceholderData ? 'is-stale' : ''}`} role="region" aria-label="Your orders" tabIndex={0}>
          <table className="adm-table sel-table">
            <thead><tr><th>Order</th><th>Your items</th><th className="num">Your total</th><th>Your status</th><th>Order</th><th>Ship to</th><th>Placed</th></tr></thead>
            <tbody>
              {orders.data.content.map((o) => (
                <tr key={o.orderNumber}>
                  <td data-label="Order"><Link to={`/seller/orders/${o.orderNumber}`} className="adm-link">{o.orderNumber}</Link></td>
                  <td data-label="Your items">{orderItemsLabel(o)}</td>
                  <td data-label="Your total" className="num">{inr(o.sellerTotal)}</td>
                  <td data-label="Your status"><StatusPill status={o.fulfillmentStatus} labels={FULFILMENT_STATUS} /></td>
                  <td data-label="Order"><StatusPill status={o.orderStatus} /></td>
                  <td data-label="Ship to">{o.shipCity}</td>
                  <td data-label="Placed" title={dateTime(o.createdAt)}>{date(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {orders.data && <Pagination page={orders.data.page} totalPages={orders.data.totalPages} onChange={setPage} />}
    </>
  );
}

export function SellerOrderDetail() {
  const { number } = useParams();
  useDocumentTitle(`Order ${number}`);
  const qc = useQueryClient();
  const toast = useToast();
  const store = useStore();
  const order = useQuery({ queryKey: ['seller', 'order', number], queryFn: () => api.seller.order(number) });
  const [next, setNext] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (order.isPending) return <Skeleton lines={6} label="Loading the order…" />;
  if (order.error) {
    if (order.error.status === 404) {
      return (
        <EmptyState icon="📦" title="Order not found" action={<Link to="/seller/orders" className="btn-primary">Back to Orders →</Link>}>
          It isn&apos;t one of your orders, or the link is wrong.
        </EmptyState>
      );
    }
    return <LoadError what="the order" error={order.error} onRetry={() => order.refetch()} />;
  }
  const o = order.data;
  const canUpdate = store.data?.status === 'APPROVED' && o.nextSteps.length > 0;

  const update = async (e) => {
    e.preventDefault();
    if (!next) {
      setError(new Error('Choose the new status.'));
      return;
    }
    if (/[<>]/.test(note)) {
      setError(new Error('Remove the < and > characters from the note.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.seller.updateOrder(number, next, note.trim() || undefined);
      qc.setQueryData(['seller', 'order', number], updated);
      qc.invalidateQueries({ queryKey: ['seller', 'orders'] });
      qc.invalidateQueries({ queryKey: ['seller', 'dashboard'] });
      toast(`Order ${number}: ${FULFILMENT_STATUS[updated.fulfillmentStatus].label}`);
      setNext('');
      setNote('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/seller/orders" className="co-continue">← All orders</Link>
      <div className="od-header">
        <div>
          <p className="od-label">Order</p>
          <h2 className="od-id">{o.orderNumber}</h2>
          <p className="co-muted">Placed {dateTime(o.createdAt)}</p>
        </div>
        <div className="od-pills">
          <StatusPill status={o.fulfillmentStatus} labels={FULFILMENT_STATUS} />
          <span className="gg-status gg-status--soft">{o.paymentMethod === 'COD' ? '💰 Cash on delivery' : '💳 Paid online'}</span>
        </div>
      </div>

      <div className="sel-grid">
        <section className="od-card" aria-labelledby="sel-items-h">
          <h2 id="sel-items-h">🎁 Your Items</h2>
          <ul className="sel-list">
            {o.items.map((i, idx) => (
              <li key={`${i.productId}-${idx}`}>
                <SafeImg src={i.image} alt="" />
                <div>
                  <span className="sel-list-title">{i.name}</span>
                  <small>Qty {i.quantity} × {inr(i.unitPrice)}</small>
                  {i.customName && <small>✍️ Personalise with: {i.customName}</small>}
                  {i.customMessage && <small>💌 Gift card: “{i.customMessage}”</small>}
                </div>
                <div className="sel-list-side">
                  <strong>{inr(i.lineTotal)}</strong>
                  <StatusPill status={i.fulfillmentStatus} labels={FULFILMENT_STATUS} />
                </div>
              </li>
            ))}
          </ul>
          <p className="sel-total"><span>Your total</span><strong>{inr(o.sellerTotal)}</strong></p>
        </section>

        <section className="od-card" aria-labelledby="sel-ship-h">
          <h2 id="sel-ship-h">🚚 Ship To</h2>
          <address className="sel-address">
            <strong>{o.shipping.fullName}</strong><br />
            {o.shipping.addressLine}<br />
            {o.shipping.city}{o.shipping.state ? `, ${o.shipping.state}` : ''} {o.shipping.pincode}<br />
            📞 <a href={`tel:${o.shipping.phone.replace(/[^+0-9]/g, '')}`}>{o.shipping.phone}</a>
          </address>
          <p className="co-muted sel-fine">Customer order status: <StatusPill status={o.orderStatus} /></p>
        </section>
      </div>

      <section className="od-card" aria-labelledby="sel-update-h">
        <h2 id="sel-update-h">📬 Update Your Status</h2>
        {o.orderStatus === 'CANCELLED' || o.fulfillmentStatus === 'CANCELLED' ? (
          <p className="co-muted">This order was cancelled. There&apos;s nothing to send.</p>
        ) : o.nextSteps.length === 0 ? (
          <p className="co-muted">All done: your items were delivered. 🎉</p>
        ) : !canUpdate ? (
          <p className="co-muted">Your store isn&apos;t active, so GiftGenius handles this order for now.</p>
        ) : (
          <form className="adm-status-form" onSubmit={update} noValidate>
            <Field label="New status" as="select" value={next} onChange={(e) => setNext(e.target.value)}>
              <option value="">Choose…</option>
              {o.nextSteps.map((s) => <option key={s} value={s}>{FULFILMENT_STATUS[s].label}</option>)}
            </Field>
            <Field label="Note for the customer (optional)" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Courier: DTDC, tracking 123456" />
            {error && <div className="gg-alert gg-alert--error" role="alert">{error.message}</div>}
            <button className="btn-primary" disabled={busy}>{busy ? 'Updating…' : 'Update Status →'}</button>
          </form>
        )}
      </section>
    </>
  );
}

// ── Analytics ──────────────────────────────────────────

export function SellerAnalytics() {
  useDocumentTitle('Seller Analytics');
  const data = useQuery({ queryKey: ['seller', 'analytics'], queryFn: api.seller.analytics });
  if (data.isPending) return <Skeleton kpis={5} label="Loading your sales…" />;
  if (data.error) return <LoadError what="your sales" error={data.error} onRetry={() => data.refetch()} />;
  const { stats, topProducts } = data.data;
  return (
    <>
      <div className="adm-kpis">
        <Kpi label="Gross sales" value={inr(stats.grossSales)} />
        <Kpi label="Orders" value={stats.orders} />
        <Kpi label="Units sold" value={stats.unitsSold} />
        <Kpi label="Average order value" value={inr(stats.averageOrderValue)} />
        <Kpi label="Cancelled orders" value={stats.cancelledOrders} />
      </div>
      <p className="co-muted sel-fine">
        Sales count confirmed orders (paid online, or cash on delivery) that weren&apos;t cancelled, at the prices shoppers paid,
        before order-wide coupons. This is revenue, not profit: product costs aren&apos;t recorded.
      </p>
      <section className="od-card" aria-labelledby="sel-top-h">
        <h2 id="sel-top-h">🏆 Top Products</h2>
        {topProducts.length === 0 ? (
          <p className="co-muted">No sales yet. Your best sellers will appear here.</p>
        ) : (
          <div className="adm-table-wrap sel-table-wrap" role="region" aria-label="Top products" tabIndex={0}>
            <table className="adm-table sel-table">
              <thead><tr><th>Product</th><th className="num">Units sold</th><th className="num">Sales</th></tr></thead>
              <tbody>
                {topProducts.map((t) => (
                  <tr key={t.productId}>
                    <td data-label="Product"><Link to={`/seller/products/${t.productId}/edit`} className="adm-link">{t.name}</Link></td>
                    <td data-label="Units sold" className="num">{t.unitsSold}</td>
                    <td data-label="Sales" className="num">{inr(t.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="od-card" aria-labelledby="sel-catalog-h">
        <h2 id="sel-catalog-h">🎁 Catalogue</h2>
        <dl className="sel-facts">
          <div><dt>Listed in the shop</dt><dd>{stats.listedProducts}</dd></div>
          <div><dt>Awaiting approval</dt><dd>{stats.pendingProducts}</dd></div>
          <div><dt>Drafts</dt><dd>{stats.draftProducts}</dd></div>
          <div><dt>Rejected</dt><dd>{stats.rejectedProducts}</dd></div>
          <div><dt>Out of stock</dt><dd>{stats.outOfStockProducts}</dd></div>
        </dl>
      </section>
    </>
  );
}

// ── Store settings ─────────────────────────────────────

const HTTPS_OR_EMPTY = /^$|^https:\/\/[^\s<>"'`]{4,990}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SellerSettings() {
  useDocumentTitle('Store Settings');
  const store = useStore();
  if (store.isPending) return <Skeleton lines={6} label="Loading your store…" />;
  if (store.error) return <LoadError what="your store" error={store.error} onRetry={() => store.refetch()} />;
  return <SettingsForm key={store.data.slug} store={store.data} />;
}

function SettingsForm({ store }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState(() => ({
    storeName: store.storeName, businessCategory: store.businessCategory, description: store.description ?? '',
    phone: store.phone, addressLine: store.addressLine, city: store.city, state: store.state, pincode: store.pincode,
    supportEmail: store.supportEmail ?? '', logoUrl: store.logoUrl ?? '', bannerUrl: store.bannerUrl ?? '',
  }));
  const [state, setState] = useState({ busy: false, error: null, errors: {} });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    const errors = validateStore(f, f.phone);
    if (f.supportEmail.trim() && !EMAIL.test(f.supportEmail.trim())) errors.supportEmail = 'Enter a valid email.';
    if (!HTTPS_OR_EMPTY.test(f.logoUrl.trim())) errors.logoUrl = 'Use an image link that starts with https://';
    if (!HTTPS_OR_EMPTY.test(f.bannerUrl.trim())) errors.bannerUrl = 'Use an image link that starts with https://';
    if (Object.keys(errors).length) {
      setState({ busy: false, error: null, errors });
      return;
    }
    setState({ busy: true, error: null, errors: {} });
    try {
      const saved = await api.seller.updateStore({
        storeName: f.storeName.trim(), businessCategory: f.businessCategory, description: f.description.trim() || null,
        phone: f.phone.trim(), supportEmail: f.supportEmail.trim() || null, addressLine: f.addressLine.trim(), city: f.city.trim(),
        state: f.state, pincode: f.pincode.trim(), logoUrl: f.logoUrl.trim() || null, bannerUrl: f.bannerUrl.trim() || null,
      });
      qc.setQueryData(['seller', 'me'], saved);
      qc.invalidateQueries({ queryKey: ['seller', 'dashboard'] });
      setState({ busy: false, error: null, errors: {} });
      toast('Store settings saved ✓');
    } catch (err) {
      setState({ busy: false, error: err, errors: storeErrors(err.errors) });
    }
  };

  const reapply = async () => {
    try {
      qc.setQueryData(['seller', 'me'], await api.seller.reapply());
      qc.invalidateQueries({ queryKey: ['seller'] });
      toast('Application sent again. We’ll review your store shortly.');
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const er = state.errors;
  return (
    <>
      <section className="od-card sel-store-meta" aria-labelledby="sel-meta-h">
        <h2 id="sel-meta-h">🏪 Your Store</h2>
        <dl className="sel-facts">
          <div><dt>Status</dt><dd><StatusPill status={store.status} labels={SELLER_STATUS} /></dd></div>
          <div><dt>Store page</dt><dd>{store.status === 'APPROVED' ? <Link to={`/store/${store.slug}`}>/store/{store.slug}</Link> : <>/store/{store.slug} <small>(live once approved)</small></>}</dd></div>
          <div><dt>Selling since</dt><dd>{date(store.createdAt)}</dd></div>
        </dl>
        {store.status === 'REJECTED' && (
          <div className="adm-actions"><button type="button" className="btn-primary btn-sm" onClick={reapply}>Apply Again →</button></div>
        )}
      </section>
      <form className="co-form-section" onSubmit={save} noValidate>
        <h2>⚙️ Store Settings</h2>
        <StoreFormFields values={f} errors={er} idPrefix="settings" onChange={(k, v) => setF((x) => ({ ...x, [k]: v }))} />
        <div className="co-form-row full">
          <Field label="Support Email (optional)" type="email" maxLength={255} value={f.supportEmail} onChange={set('supportEmail')}
            error={er.supportEmail} hint="Where GiftGenius can forward customer questions about your products." />
        </div>
        <div className="co-form-row">
          <Field label="Logo Image Link (optional)" type="url" maxLength={1000} value={f.logoUrl} onChange={set('logoUrl')} error={er.logoUrl} placeholder="https://" />
          <Field label="Banner Image Link (optional)" type="url" maxLength={1000} value={f.bannerUrl} onChange={set('bannerUrl')} error={er.bannerUrl} placeholder="https://" />
        </div>
        <p className="co-muted sel-fine">Your store name, description, logo and banner appear on your public store page. Your phone, address and email are only for GiftGenius.</p>
        {state.error && !Object.keys(er).length && <div className="gg-alert gg-alert--error" role="alert">{state.error.message}</div>}
        <button className="btn-primary" disabled={state.busy}>{state.busy ? 'Saving…' : 'Save Store Settings →'}</button>
      </form>
    </>
  );
}
