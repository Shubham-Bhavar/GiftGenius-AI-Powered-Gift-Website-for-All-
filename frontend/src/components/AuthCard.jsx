import { useId, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';

// `label` is what assistive tech announces for each mode (dialog and form name); `title` is the visible heading.
const COPY = {
  login: { label: 'Sign in', title: 'Welcome Back', sub: 'Sign in to your GiftGenius account', cta: 'Sign In →', busy: 'Signing in…' },
  register: { label: 'Create account', title: 'Create Account', sub: 'Save gift ideas, track orders and check out faster', cta: 'Create Account →', busy: 'Creating account…' },
  forgot: { label: 'Forgot password', title: 'Forgot Password', sub: "Enter your email and we'll send you a reset link", cta: 'Send Reset Link →', busy: 'Sending…' },
};

/** Accessible name for the sign-in card in a given mode ("Sign in", "Create account", "Forgot password"). */
export const authLabel = (mode) => (COPY[mode] ?? COPY.login).label;

function AuthField({ label, error, ...props }) {
  const id = useId();
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-e` : undefined} {...props} />
      {error && <small id={`${id}-e`} className="auth-error">{error}</small>}
    </div>
  );
}

/**
 * The homepage's sign-in card (👤 avatar, serif heading, mono labels, ink→teal button),
 * wired to the real API. Used in the header modal and on the /login, /register and /forgot-password pages.
 */
export default function AuthCard({ mode, onModeChange, onDone, pageHeading = false }) {
  const Title = pageHeading ? 'h1' : 'h2';
  const { login, register } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', phone: '' });
  const [state, setState] = useState({ busy: false, error: null, errors: {}, sent: false });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const c = COPY[mode];
  const titleId = useId();
  const subId = useId();

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: null, errors: {}, sent: false });
    try {
      if (mode === 'login') {
        const u = await login(form.email.trim(), form.password);
        toast(`Welcome back, ${u.fullName.split(' ')[0]}! 🎁`);
        onDone?.(u);
      } else if (mode === 'register') {
        const u = await register({ fullName: form.fullName.trim(), email: form.email.trim(), password: form.password,
          phone: form.phone.trim() || undefined });
        toast(`Welcome to GiftGenius, ${u.fullName.split(' ')[0]}! 🎁`);
        onDone?.(u);
      } else {
        await api.forgotPassword(form.email.trim());
        setState({ busy: false, error: null, errors: {}, sent: true });
        return;
      }
      setState({ busy: false, error: null, errors: {}, sent: false });
    } catch (err) {
      setState({ busy: false, error: err, errors: err.errors || {}, sent: false });
    }
  };

  const er = state.errors;
  return (
    <form className="auth-card" onSubmit={submit} aria-label={c.label}>
      <div className="auth-head">
        <div className="auth-avatar" aria-hidden="true">👤</div>
        <Title className="auth-title" id={titleId}>{c.title}</Title>
        <p className="auth-sub" id={subId}>{c.sub}</p>
      </div>

      {state.sent ? (
        <p className="auth-note" role="status">
          If an account exists for <strong>{form.email}</strong>, we&apos;ve emailed a link to reset the password. It expires in 30 minutes.
        </p>
      ) : (
        // Moving between modes swaps these fields; the group name/description tells screen readers which mode they are in.
        <div className="auth-fields" role="group" aria-labelledby={titleId} aria-describedby={subId}>
          {mode === 'register' && (
            <AuthField label="Full name" required maxLength={120} autoComplete="name" value={form.fullName}
              onChange={set('fullName')} error={er.fullName} placeholder="Priya Rajan" />
          )}
          <AuthField label="Email" type="email" required autoComplete="email" value={form.email} onChange={set('email')}
            error={er.email} placeholder="you@example.com" />
          {mode === 'register' && (
            <AuthField label="Phone (optional)" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')}
              error={er.phone} placeholder="+91 98765 43210" />
          )}
          {mode !== 'forgot' && (
            <AuthField label="Password" type="password" required minLength={mode === 'register' ? 8 : undefined} maxLength={72}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={form.password}
              onChange={set('password')} error={er.password} placeholder="••••••••" />
          )}
          {state.error && !Object.keys(er).length && <p className="auth-error auth-error--block" role="alert">{state.error.message}</p>}
          <button type="submit" className="auth-submit" disabled={state.busy}>{state.busy ? c.busy : c.cta}</button>
        </div>
      )}

      <div className="auth-links">
        {mode === 'login' && (
          <button type="button" className="auth-link" onClick={() => onModeChange('forgot')}>Forgot password?</button>
        )}
        {mode !== 'login' && (
          <button type="button" className="auth-link" onClick={() => onModeChange('login')}>← Back to sign in</button>
        )}
      </div>
      {mode === 'login' && (
        <div className="auth-foot">
          <p>Don&apos;t have an account? <button type="button" className="auth-link auth-link--gold" onClick={() => onModeChange('register')}>Sign up free</button></p>
        </div>
      )}
      {mode === 'register' && (
        <div className="auth-foot">
          <p>Already have an account? <button type="button" className="auth-link auth-link--gold" onClick={() => onModeChange('login')}>Sign in</button></p>
        </div>
      )}
    </form>
  );
}
