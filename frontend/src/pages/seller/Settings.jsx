import { useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import StoreFormFields, { storeErrors, validateStore } from '../../components/seller/StoreForm.jsx';
import { Field, StatusPill } from '../../components/common/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { sellerApi, sellerKeys } from '../../services/seller.js';
import { date } from '../../utils/format.js';
import { SELLER_STATUS } from '../../constants/marketplace.js';
import { LoadError, Skeleton, useStore } from './shared.jsx';
import { EMAIL_RE, HTTPS_URL_RE } from '../../utils/validation.js';

const httpsOrEmpty = (v) => v === '' || HTTPS_URL_RE.test(v);

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
    if (f.supportEmail.trim() && !EMAIL_RE.test(f.supportEmail.trim())) errors.supportEmail = 'Enter a valid email.';
    if (!httpsOrEmpty(f.logoUrl.trim())) errors.logoUrl = 'Use an image link that starts with https://';
    if (!httpsOrEmpty(f.bannerUrl.trim())) errors.bannerUrl = 'Use an image link that starts with https://';
    if (Object.keys(errors).length) {
      setState({ busy: false, error: null, errors });
      return;
    }
    setState({ busy: true, error: null, errors: {} });
    try {
      const saved = await sellerApi.updateStore({
        storeName: f.storeName.trim(), businessCategory: f.businessCategory, description: f.description.trim() || null,
        phone: f.phone.trim(), supportEmail: f.supportEmail.trim() || null, addressLine: f.addressLine.trim(), city: f.city.trim(),
        state: f.state, pincode: f.pincode.trim(), logoUrl: f.logoUrl.trim() || null, bannerUrl: f.bannerUrl.trim() || null,
      });
      qc.setQueryData(sellerKeys.store(), saved);
      qc.invalidateQueries({ queryKey: sellerKeys.dashboard() });
      setState({ busy: false, error: null, errors: {} });
      toast('Store settings saved ✓');
    } catch (err) {
      setState({ busy: false, error: err, errors: storeErrors(err.errors) });
    }
  };

  const reapply = async () => {
    try {
      qc.setQueryData(sellerKeys.store(), await sellerApi.reapply());
      qc.invalidateQueries({ queryKey: sellerKeys.all() });
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
