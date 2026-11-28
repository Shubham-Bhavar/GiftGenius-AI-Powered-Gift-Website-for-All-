import { useEffect, useState, useSyncExternalStore } from 'react';
import { onPendingChange, pendingRequests } from '../../services/api/client.js';

/** How long requests may be waiting before the notice appears. */
export const WAKE_NOTICE_DELAY_MS = 6000;
export const WAKE_MESSAGE = 'Our free server is waking up. This can take up to 2 minutes.';

let delayMs = WAKE_NOTICE_DELAY_MS;
/** For tests only: a shorter wait before the notice appears (no argument restores the default). */
export function __setWakeNoticeDelayForTests(ms) {
  delayMs = ms ?? WAKE_NOTICE_DELAY_MS;
}

const subscribe = (onChange) => onPendingChange(onChange);
const anyPending = () => pendingRequests() > 0;

/**
 * Explains a long wait. The backend sleeps when idle and takes about two minutes to start, so once API requests have
 * been waiting for a few seconds (any page, including "Restoring your session…") this says so. The live region stays
 * mounted, empty, so screen readers announce the message when it appears.
 */
export function ServerWakeNotice() {
  const busy = useSyncExternalStore(subscribe, anyPending, () => false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!busy) return undefined;
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [busy]);

  return (
    <div className="wake-notice" role="status" aria-live="polite" aria-label="Server status">
      {busy && slow && <p className="gg-alert gg-alert--info">{WAKE_MESSAGE}</p>}
    </div>
  );
}
