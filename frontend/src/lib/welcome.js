/**
 * Who sees the first-visit welcome screen (Log In / Sign Up / Continue without an account).
 *
 * - Signed-in shoppers, and returning members whose session is being restored, never see it.
 * - "Continue without an account" is remembered on this device (localStorage), so returning guests go
 *   straight to the shop.
 * - Log In / Sign Up / closing the screen count as answered for this browser session only, so someone who
 *   backs out of signing in isn't asked again until their next visit.
 *
 * Nothing here talks to the backend or creates an account: guests keep using the local cart and wishlist.
 */
import { hasSessionHint } from './api.js';
import { storage } from './storage.js';

const GUEST_KEY = 'gg-guest';
const ANSWERED_KEY = 'gg-welcome-answered';

function sessionGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* storage blocked: the screen may simply show again next time */
  }
}

export function shouldShowWelcome(user) {
  if (user || hasSessionHint()) return false;
  if (storage.get(GUEST_KEY) === '1') return false;
  return sessionGet(ANSWERED_KEY) !== '1';
}

/** Log In, Sign Up or dismissing the screen: don't ask again during this visit. */
export function markWelcomeAnswered() {
  sessionSet(ANSWERED_KEY, '1');
}

/** "Continue without an account": don't ask again on this device. */
export function rememberGuestChoice() {
  storage.set(GUEST_KEY, '1');
  markWelcomeAnswered();
}
