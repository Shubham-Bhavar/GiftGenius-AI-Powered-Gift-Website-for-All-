import { useId, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { ApiError } from '../../services/api/client.js';
import { authApi } from '../../services/auth.js';
import { titleCase } from '../../utils/format.js';
import { INDIAN_STATES } from '../../constants/india.js';
import { SELLER_CATEGORIES } from '../../constants/marketplace.js';
import { EMAIL_RE, PHONE_RE } from '../../utils/validation.js';
import { EMPTY_STORE, storeBody, storeErrors, validateStore } from '../seller/StoreForm.jsx';

// `label` is what assistive tech announces for each mode (dialog and form name); `title` is the visible heading.
const COPY = {
  login: { label: 'Sign in', title: 'Welcome Back', sub: 'Sign in to your GiftGenius account', cta: 'Sign In →', busy: 'Signing in…' },
  register: { label: 'Create account', title: 'Create Account', sub: 'Save gift ideas, track orders and check out faster', cta: 'Create Account →', busy: 'Creating account…' },
  forgot: { label: 'Forgot password', title: 'Forgot Password', sub: "Enter your email and we'll send you a reset link", cta: 'Send Reset Link →', busy: 'Sending…' },
};

/** Accessible name for the sign-in card in a given mode ("Sign in", "Create account", "Forgot password"). */
export const authLabel = (mode) => (COPY[mode] ?? COPY.login).label;

export const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

/** Checks the form before calling the API, with the same rules as the backend. Returns { field: message }. */
export function validateAuthForm(mode, form, accountType = 'customer') {
  const errors = {};
  if (mode === 'register' && !form.fullName.trim()) errors.fullName = 'Enter your full name.';
  const email = form.email.trim();
  if (!email) errors.email = 'Enter your email address.';
  else if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address, like name@example.com.';
  if (mode === 'register' && form.phone.trim() && !PHONE_RE.test(form.phone.trim())) {
    errors.phone = 'Enter a valid phone number, like +91 98765 43210.';
  }
  if (mode === 'login' && !form.password) errors.password = 'Enter your password.';
  if (mode === 'register') {
    if (!form.password) errors.password = 'Choose a password.';
    else if (form.password.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters.`;
    else if (form.password.length > PASSWORD_MAX) errors.password = `Use ${PASSWORD_MAX} characters or fewer.`;
    if (!form.confirm) errors.confirm = 'Re-enter your password.';
    else if (!errors.password && form.confirm !== form.password) errors.confirm = "The passwords don't match.";
    if (accountType === 'seller') Object.assign(errors, validateStore(form, form.phone));
  }
  return errors;
}

function AuthField({ label, error, hint, as = 'input', children, ...props }) {
  const id = useId();
  const describedBy = [error ? `${id}-e` : null, hint ? `${id}-h` : null].filter(Boolean).join(' ') || undefined;
  const common = { id, 'aria-invalid': !!error, 'aria-describedby': describedBy, ...props };
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      {as === 'select' ? <select {...common}>{children}</select> : as === 'textarea' ? <textarea {...common} /> : <input {...common} />}
      {error && <small id={`${id}-e`} className="auth-error">{error}</small>}
      {hint && <small id={`${id}-h`} className="auth-hint">{hint}</small>}
    </div>
  );
}

/**
 * The message shown for a failed request. Chosen by HTTP status, so server wording never leaks through for
 * sign-in failures, rate limits or server errors; 400/409 details are written for shoppers and shown as-is.
 */
export function authErrorMessage(mode, err) {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (err.status === 0) return 'Unable to connect. Please try again.';
  if (err.status === 401 && mode === 'login') return 'Invalid email or password.';
  if (err.status === 403) return "This account can't sign in right now. Please contact support.";
  if (err.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (err.status >= 500 || err.status === 401) return 'Something went wrong on our side. Please try again.';
  return err.message;
}

const firstName = (u) => (u.fullName || '').split(' ')[0] || 'there';

/**
 * The homepage's sign-in card (👤 avatar, serif heading, mono labels, ink→teal button),
 * wired to the real API. Used in the header modal and on the /login, /register and /forgot-password pages.
 * `note` explains why sign-in is being asked for (e.g. at checkout).
 */
/** The store fields of the seller sign-up, in the sign-in card's style. */
function StoreFields({ values, errors, onChange }) {
  const set = (k) => (e) => onChange(k, e.target.value);
  return (
    <>
      <AuthField label="Store name" maxLength={80} autoComplete="organization" value={values.storeName} onChange={set('storeName')}
        error={errors.storeName} placeholder="Priya's Handmade Gifts" />
      <AuthField label="What you sell" as="select" value={values.businessCategory} onChange={set('businessCategory')} error={errors.businessCategory}>
        <option value="">Choose a category…</option>
        {SELLER_CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
      </AuthField>
      <AuthField label="Store description (optional)" as="textarea" rows={3} maxLength={1000} value={values.description}
        onChange={set('description')} error={errors.description} placeholder="What makes your gifts special?" />
      <AuthField label="Business address" maxLength={300} autoComplete="street-address" value={values.addressLine}
        onChange={set('addressLine')} error={errors.addressLine} placeholder="Shop 4, FC Road" />
      <div className="auth-row">
        <AuthField label="City" maxLength={80} autoComplete="address-level2" value={values.city} onChange={set('city')} error={errors.city} />
        <AuthField label="PIN code" inputMode="numeric" maxLength={6} autoComplete="postal-code" value={values.pincode}
          onChange={set('pincode')} error={errors.pincode} placeholder="411004" />
      </div>
      <AuthField label="State" as="select" autoComplete="address-level1" value={values.state} onChange={set('state')} error={errors.state}>
        <option value="">Choose…</option>
        {INDIAN_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
      </AuthField>
    </>
  );
}

export default function AuthCard({ mode, onModeChange, onDone, pageHeading = false, note, initialAccountType = 'customer' }) {
  const Title = pageHeading ? 'h1' : 'h2';
  const { login, register } = useAuth();
  const toast = useToast();
  const formRef = useRef(null);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '', phone: '', ...EMPTY_STORE });
  const [accountType, setAccountType] = useState(initialAccountType === 'seller' ? 'seller' : 'customer');
  const seller = mode === 'register' && accountType === 'seller';
  const [state, setState] = useState({ busy: false, error: null, errors: {}, sent: false });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const c = COPY[mode];
  const titleId = useId();
  const subId = useId();

  const focusFirstError = () => setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus(), 0);

  const submit = async (e) => {
    e.preventDefault();
    if (state.busy) return;
    const errors = validateAuthForm(mode, form, accountType);
    if (Object.keys(errors).length) {
      setState({ busy: false, error: null, errors, sent: false });
      focusFirstError();
      return;
    }
    setState({ busy: true, error: null, errors: {}, sent: false });
    try {
      if (mode === 'login') {
        const u = await login(form.email.trim(), form.password);
        toast(`Welcome back, ${firstName(u)}! 🎁`);
        onDone?.(u);
      } else if (mode === 'register') {
        const u = await register({ fullName: form.fullName.trim(), email: form.email.trim(), password: form.password,
          phone: form.phone.trim() || undefined, seller: seller ? storeBody(form, form.phone) : undefined });
        toast(seller ? `Welcome, ${firstName(u)}! Your store is waiting for approval. 🏪`
          : `Account created. Welcome to GiftGenius, ${firstName(u)}! 🎁`);
        onDone?.(u);
      } else {
        await authApi.forgotPassword(form.email.trim());
        setState({ busy: false, error: null, errors: {}, sent: true });
        return;
      }
      setState({ busy: false, error: null, errors: {}, sent: false });
    } catch (err) {
      setState({ busy: false, error: err, errors: storeErrors(err.errors), sent: false });
      if (err.errors && Object.keys(err.errors).length) focusFirstError();
    }
  };

  const er = state.errors;
  return (
    <form className="auth-card" onSubmit={submit} aria-label={c.label} noValidate ref={formRef}>
      <div className="auth-head">
        <div className="auth-avatar" aria-hidden="true">👤</div>
        <Title className="auth-title" id={titleId}>{c.title}</Title>
        <p className="auth-sub" id={subId}>{seller ? 'Open your store on GiftGenius and reach gift shoppers across India' : c.sub}</p>
        {note && <p className="auth-context">{note}</p>}
      </div>

      {state.sent ? (
        <p className="auth-note" role="status">
          If an account exists for <strong>{form.email}</strong>, we&apos;ve emailed a link to reset the password. It expires in 30 minutes.
        </p>
      ) : (
        // Moving between modes swaps these fields; the group name/description tells screen readers which mode they are in.
        <div className="auth-fields" role="group" aria-labelledby={titleId} aria-describedby={subId}>
          {mode === 'register' && (
            <fieldset className="auth-type">
              <legend>Account type</legend>
              {[['customer', 'Customer', 'Shop and send gifts'], ['seller', 'Seller', 'Sell your gifts here']].map(([value, label, sub]) => (
                <label key={value} className={`auth-type-opt ${accountType === value ? 'is-selected' : ''}`}>
                  <input type="radio" name="account-type" value={value} checked={accountType === value}
                    onChange={() => { setAccountType(value); setState((st) => ({ ...st, errors: {} })); }} />
                  <span><strong>{label}</strong><small>{sub}</small></span>
                </label>
              ))}
            </fieldset>
          )}
          {mode === 'register' && (
            <AuthField label="Full name" maxLength={120} autoComplete="name" value={form.fullName}
              onChange={set('fullName')} error={er.fullName} placeholder="Priya Rajan" />
          )}
          <AuthField label="Email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')}
            error={er.email} placeholder="you@example.com" />
          {mode === 'register' && (
            <AuthField label={seller ? 'Phone' : 'Phone (optional)'} type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')}
              error={er.phone} placeholder="+91 98765 43210" />
          )}
          {mode !== 'forgot' && (
            <AuthField label="Password" type="password" maxLength={PASSWORD_MAX}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={form.password}
              onChange={set('password')} error={er.password} placeholder="••••••••"
              hint={mode === 'register' ? `At least ${PASSWORD_MIN} characters.` : undefined} />
          )}
          {mode === 'register' && (
            <AuthField label="Confirm password" type="password" maxLength={PASSWORD_MAX} autoComplete="new-password"
              value={form.confirm} onChange={set('confirm')} error={er.confirm} placeholder="••••••••" />
          )}
          {seller && (
            <>
              <p className="auth-section">Your store</p>
              <StoreFields values={form} errors={er} onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))} />
              <p className="auth-note auth-note--inline">New stores are reviewed by GiftGenius before they can sell. You can prepare products while you wait.</p>
            </>
          )}
          {state.error && !Object.keys(er).length && (
            <p className="auth-error auth-error--block" role="alert">
              {seller && state.error.status === 409 && /email already exists/i.test(state.error.message)
                ? 'An account with this email already exists. Sign in, then choose "Sell on GiftGenius" in your account to open your store.'
                : authErrorMessage(mode, state.error)}
            </p>
          )}
          <button type="submit" className="auth-submit" disabled={state.busy} aria-busy={state.busy}>
            {state.busy ? c.busy : seller ? 'Create Seller Account →' : c.cta}
          </button>
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
