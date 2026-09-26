import { useState } from 'react';
import { Link } from 'react-router';
import { ErrorNote, Field, PageHero, PasswordField } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../lib/api.js';

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
        </div>

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
      </div>
    </>
  );
}
