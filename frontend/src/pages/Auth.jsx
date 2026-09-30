import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import AuthCard from '../components/AuthCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../lib/api.js';
import { homeFor } from '../lib/marketplace.js';

/** Only allow same-site relative redirects after sign-in (no open redirects). */
export function safeNext(raw) {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}

const PATHS = { login: '/login', register: '/register', forgot: '/forgot-password' };

/** Full-page sign-in / register / forgot password, using the same card as the header modal. */
export function AuthPage({ mode }) {
  useDocumentTitle(mode === 'register' ? 'Create Account' : mode === 'forgot' ? 'Forgot Password' : 'Sign In');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const askedFor = params.has('next');
  const [done, setDone] = useState(false);

  if (user && !done && mode !== 'forgot') return <Navigate to={next} replace />;
  const query = next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <div className="auth-page">
      <AuthCard
        pageHeading
        mode={mode}
        initialAccountType={params.get('type') === 'seller' ? 'seller' : 'customer'}
        onModeChange={(m) => navigate(`${PATHS[m]}${query}`, { replace: true })}
        onDone={(u) => { setDone(true); navigate(askedFor ? next : homeFor(u) ?? '/', { replace: true }); }}
      />
    </div>
  );
}

export function ResetPassword() {
  useDocumentTitle('Reset Password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const toast = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState({ busy: false, error: null, field: null });

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setState({ busy: false, error: new Error('The passwords do not match.'), field: 'confirm' });
      return;
    }
    setState({ busy: true, error: null, field: null });
    try {
      await api.resetPassword(token, password);
      toast('Password changed. Sign in with your new password. 🔐');
      navigate('/login', { replace: true });
    } catch (err) {
      setState({ busy: false, error: err, field: err.errors?.password ? 'password' : null });
    }
  };
  // Tie an error to the field it belongs to, so screen readers read it with that field.
  const bad = (field) => !!state.error && state.field === field;

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit} aria-label="Reset password">
        <div className="auth-head">
          <div className="auth-avatar" aria-hidden="true">🔐</div>
          <h1 className="auth-title">{token ? 'Reset Password' : 'Reset Link Missing'}</h1>
          <p className="auth-sub" id="rp-hint">{token ? 'Choose a new password of at least 8 characters.' : 'Open the link from your email again, or request a new one.'}</p>
        </div>
        {token ? (
          <div className="auth-fields">
            <div className="auth-field">
              <label htmlFor="rp-new">New password</label>
              <input id="rp-new" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                aria-invalid={bad('password')} aria-describedby={bad('password') ? 'rp-error rp-hint' : 'rp-hint'} />
            </div>
            <div className="auth-field">
              <label htmlFor="rp-confirm">Confirm new password</label>
              <input id="rp-confirm" type="password" required maxLength={72} autoComplete="new-password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••"
                aria-invalid={bad('confirm')} aria-describedby={bad('confirm') ? 'rp-error' : undefined} />
            </div>
            {state.error && <p className="auth-error auth-error--block" id="rp-error" role="alert">{state.error.errors?.password || state.error.message}</p>}
            <button className="auth-submit" disabled={state.busy}>{state.busy ? 'Saving…' : 'Save New Password →'}</button>
          </div>
        ) : (
          <Link to="/forgot-password" className="auth-submit auth-submit--link">Request a New Link →</Link>
        )}
      </form>
    </div>
  );
}
