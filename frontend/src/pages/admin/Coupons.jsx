import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorNote, Field, Spinner } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
import { date, inr } from '../../lib/format.js';

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
