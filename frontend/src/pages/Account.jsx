import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { EMPTY_STORE, storeBody, storeErrors, validateStore } from '../components/AuthCard.jsx';
import StoreFormFields from '../components/StoreForm.jsx';
import { ErrorNote, Field, Notice, PageHero, PasswordField, StatusPill } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../lib/api.js';
import { SELLER_STATUS } from '../lib/marketplace.js';

/** A seller's store status, read fresh (an admin may have reviewed it since sign-in). */
function YourStore({ fallbackStatus }) {
  const store = useQuery({ queryKey: ['seller', 'me'], queryFn: api.seller.me });
  return (
    <div className="co-form-section acc-seller">
      <h2>🏪 Your Store</h2>
      <p className="acc-seller-status">
        {store.data?.storeName ?? 'Store'} status: <StatusPill status={store.data?.status ?? fallbackStatus} labels={SELLER_STATUS} />
      </p>
      <Link to="/seller" className="btn-primary">Go to Seller Center →</Link>
    </div>
  );
}

/** A customer opens a store with the account they already have (orders and wishlist stay). */
function StartSelling() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => window.location.hash === '#sell');
  const [store, setStore] = useState(() => ({ ...EMPTY_STORE, phone: user.phone ?? '' }));
  const [state, setState] = useState({ busy: false, error: null, errors: {} });

  const submit = async (e) => {
    e.preventDefault();
    const errors = validateStore(store, store.phone);
    if (Object.keys(errors).length) {
      setState({ busy: false, error: null, errors });
      return;
    }
    setState({ busy: true, error: null, errors: {} });
    try {
      await api.becomeSeller(storeBody(store, store.phone));
      toast('Your store is set up and waiting for approval. 🏪');
      navigate('/seller');
    } catch (err) {
      setState({ busy: false, error: err, errors: storeErrors(err.errors) });
    }
  };

  return (
    <section className="co-form-section" id="sell" aria-labelledby="sell-h">
      <h2 id="sell-h">🏪 Sell on GiftGenius</h2>
      <p className="co-muted">Open a store with this account and list your gifts in the shop. Your orders and wishlist stay as they are.</p>
      {!open ? (
        <button type="button" className="btn-outline" onClick={() => setOpen(true)}>Start Selling →</button>
      ) : (
        <form onSubmit={submit} noValidate className="acc-sell-form">
          <StoreFormFields values={store} errors={state.errors} idPrefix="sell"
            onChange={(k, v) => setStore((x) => ({ ...x, [k]: v }))} />
          <Notice>GiftGenius reviews every new store before it can sell. You can prepare products while you wait.</Notice>
          <ErrorNote error={Object.keys(state.errors).length ? null : state.error} />
          <div className="adm-actions">
            <button className="btn-primary" disabled={state.busy}>{state.busy ? 'Opening your store…' : 'Open My Store →'}</button>
            <button type="button" className="btn-outline" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}

export default function Account() {
  useDocumentTitle('Account Settings');
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState({ fullName: user.fullName, phone: user.phone ?? '' });
  const [pState, setPState] = useState({ busy: false, error: null, errors: {} });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [wState, setWState] = useState({ busy: false, error: null, errors: {} });

  const saveProfile = async (e) => {
    e.preventDefault();
    setPState({ busy: true, error: null, errors: {} });
    try {
      setUser(await api.updateProfile({ fullName: profile.fullName, phone: profile.phone.trim() }));
      setPState({ busy: false, error: null, errors: {} });
      toast('Profile saved ✓');
    } catch (err) {
      setPState({ busy: false, error: err, errors: err.errors || {} });
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setWState({ busy: true, error: null, errors: {} });
    try {
      await api.changePassword(pw.currentPassword, pw.newPassword);
      setPw({ currentPassword: '', newPassword: '' });
      setWState({ busy: false, error: null, errors: {} });
      toast('Password changed. Other devices have been signed out. 🔐');
    } catch (err) {
      setWState({ busy: false, error: err, errors: err.errors || {} });
    }
  };

  return (
    <>
      <PageHero eyebrow="Your Account" title="Account" em="Settings">Hello, {user.fullName.split(' ')[0]} 👋</PageHero>
      <div className="gg-page gg-page--narrow">
        <div className="acc-links">
          <Link to="/account/orders" className="acc-link"><span>📦</span>My Orders</Link>
          <Link to="/wishlist" className="acc-link"><span>❤️</span>Wishlist</Link>
          <Link to="/track" className="acc-link"><span>🗺️</span>Track an Order</Link>
          {user.role === 'SELLER' && <Link to="/seller" className="acc-link"><span>🏪</span>Seller Center</Link>}
        </div>

        {user.role === 'SELLER' && <YourStore fallbackStatus={user.sellerStatus} />}

        <form className="co-form-section" onSubmit={saveProfile}>
          <h2>👤 Profile</h2>
          <div className="co-form-row full">
            <Field label="Email" value={user.email} disabled hint="Contact support to change your email" />
          </div>
          <div className="co-form-row">
            <Field label="Full Name" required maxLength={120} value={profile.fullName}
              onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))} error={pState.errors.fullName} />
            <Field label="Phone" type="tel" value={profile.phone} placeholder="+91 98765 43210"
              onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} error={pState.errors.phone} />
          </div>
          <ErrorNote error={Object.keys(pState.errors).length ? null : pState.error} />
          <button className="btn-primary" disabled={pState.busy}>{pState.busy ? 'Saving…' : 'Save Profile →'}</button>
        </form>

        <form className="co-form-section" onSubmit={changePassword}>
          <h2>🔐 Change Password</h2>
          <div className="co-form-row">
            <PasswordField label="Current Password" required autoComplete="current-password" value={pw.currentPassword}
              onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} error={wState.errors.currentPassword} />
            <PasswordField label="New Password" required minLength={8} maxLength={72} autoComplete="new-password" value={pw.newPassword}
              onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} error={wState.errors.newPassword} hint="At least 8 characters" />
          </div>
          <ErrorNote error={Object.keys(wState.errors).length ? null : wState.error} />
          <button className="btn-primary" disabled={wState.busy}>{wState.busy ? 'Saving…' : 'Change Password →'}</button>
        </form>

        {user.role === 'CUSTOMER' && <StartSelling />}
      </div>
    </>
  );
}
