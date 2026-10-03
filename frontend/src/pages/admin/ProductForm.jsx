import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorNote, Field } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';

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

/** Create or edit a product (GiftGenius's own, or a seller's). */
export function ProductForm({ product, onDone }) {
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
