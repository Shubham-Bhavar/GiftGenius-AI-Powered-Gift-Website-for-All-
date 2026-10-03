import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import SafeImg from '../../components/common/SafeImg.jsx';
import { EmptyState, Field, Notice, StatusPill } from '../../components/common/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { sellerApi, sellerKeys, sellerQueries } from '../../services/seller.js';
import { titleCase } from '../../lib/format.js';
import { PRODUCT_STATUS, SELLER_CATEGORIES, SELLER_OCCASIONS, productState } from '../../lib/marketplace.js';
import { canEditProducts, LoadError, Skeleton, useStore } from './shared.jsx';
import { catalogKeys } from '../../services/catalog.js';

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
  const product = useQuery({ ...sellerQueries.product(id), enabled: editing });
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
      const saved = product ? await sellerApi.updateProduct(product.id, body) : await sellerApi.createProduct(body);
      qc.invalidateQueries({ queryKey: sellerKeys.all() });
      [catalogKeys.product(), catalogKeys.products(), catalogKeys.catalog()].forEach((queryKey) => qc.invalidateQueries({ queryKey }));
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
