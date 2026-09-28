import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import AuthCard, { authLabel } from './AuthCard.jsx';
import { useUi } from '../context/UiContext.jsx';
import { useRestoreFocus } from '../hooks/useRestoreFocus.js';
import { trapFocus } from '../lib/focus.js';

/** The 👤 sign-in modal from the homepage header. */
export default function AuthModal() {
  const { authMode, authOptions, openAuth, closeAuth } = useUi();
  const navigate = useNavigate();
  const open = !!authMode;
  const next = authOptions?.next;

  useRestoreFocus(open);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeAuth(); };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => document.querySelector('.auth-modal input')?.focus(), 100);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open, authMode, closeAuth]);

  return (
    <div className={`auth-overlay ${open ? 'open' : ''}`} aria-hidden={!open} inert={!open}
      onClick={(e) => { if (e.target === e.currentTarget) closeAuth(); }}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-label={authLabel(authMode)} onKeyDown={trapFocus}>
        <button type="button" className="auth-close" aria-label={`Close ${authLabel(authMode).toLowerCase()}`} onClick={closeAuth}>✕</button>
        {open && (
          <AuthCard key={authMode} mode={authMode} note={authOptions?.note}
            onModeChange={(m) => openAuth(m, authOptions)}
            onDone={() => { closeAuth(); if (next) navigate(next); }} />
        )}
      </div>
    </div>
  );
}
