import { useEffect, useRef } from 'react';
import { useUi } from '../context/UiContext.jsx';
import { useRestoreFocus } from '../hooks/useRestoreFocus.js';
import { trapFocus } from '../lib/focus.js';
import { markWelcomeAnswered, rememberGuestChoice } from '../lib/welcome.js';

// After closing, focus goes back where it was; if that's gone (the entry animation), to the page content.
const focusPageIfLost = () => setTimeout(() => {
  const active = document.activeElement;
  if (!active || active === document.body || active.closest?.('.welcome-overlay')) {
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }
}, 0);

/**
 * First-visit welcome, shown after the entry animation: Log In, Sign Up, or continue without an account.
 * Log In / Sign Up hand over to the existing sign-in dialog; guests keep browsing with the local cart and wishlist.
 */
export default function WelcomeGate() {
  const { welcomeOpen: open, closeWelcome, openAuth } = useUi();
  const heading = useRef(null);

  useRestoreFocus(open);
  useEffect(() => {
    if (!open) return undefined;
    // Focus the heading, not "Log In": shoppers open the gift with Enter, and a second Enter must not start
    // signing in. Screen readers still announce the dialog; Tab reaches "Log In" first.
    const t = setTimeout(() => heading.current?.focus({ preventScroll: true }), 60);
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      markWelcomeAnswered();
      closeWelcome();
      focusPageIfLost();
    };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [open, closeWelcome]);

  const signIn = (mode) => {
    markWelcomeAnswered();
    closeWelcome();
    openAuth(mode);
  };
  const continueAsGuest = () => {
    rememberGuestChoice();
    closeWelcome();
    focusPageIfLost();
  };

  return (
    <div className={`welcome-overlay ${open ? 'open' : ''}`} aria-hidden={!open} inert={!open}>
      <section className="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title"
        aria-describedby="welcome-desc" onKeyDown={trapFocus}>
        <p className="welcome-eyebrow" aria-hidden="true"><span className="welcome-rule" />Curated with love<span className="welcome-rule" /></p>
        <h2 id="welcome-title" className="welcome-title" tabIndex={-1} ref={heading}>Welcome to <em>GiftGenius</em></h2>
        <p id="welcome-desc" className="welcome-desc">
          Find thoughtful gifts, discover curated collections, and let GiftGenius help you choose something meaningful.
        </p>
        <div className="welcome-actions">
          <button type="button" className="welcome-btn welcome-btn--primary" onClick={() => signIn('login')}>Log In</button>
          <button type="button" className="welcome-btn welcome-btn--secondary" onClick={() => signIn('register')}>Sign Up</button>
        </div>
        <button type="button" className="welcome-guest" onClick={continueAsGuest}>
          Continue without an account <span aria-hidden="true">→</span>
        </button>
        <p className="welcome-note">Your cart and wishlist stay on this device. Sign in any time to keep them with your account.</p>
      </section>
    </div>
  );
}
