import { useEffect, useRef } from 'react';

/**
 * Remembers what had focus when an overlay opens and puts focus back there when it closes, so
 * keyboard users land where they were. Call it before the overlay's own "focus the close button" effect.
 */
export function useRestoreFocus(open) {
  const previous = useRef(null);
  useEffect(() => {
    if (open) {
      previous.current = document.activeElement;
      return;
    }
    const el = previous.current;
    previous.current = null;
    if (el?.isConnected && typeof el.focus === 'function') el.focus({ preventScroll: true });
  }, [open]);
}
