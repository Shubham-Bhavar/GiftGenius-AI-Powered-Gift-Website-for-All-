import { Children, cloneElement, useCallback } from 'react';
import { REVEAL } from './motion.js';

/**
 * Starts the scroll reveal inside `container`: its cards (REVEAL.selector) fade up once they scroll into view,
 * including cards rendered later (e.g. after data loads). Returns a function that stops it.
 */
function revealWithin(container) {
  if (!container || typeof IntersectionObserver === 'undefined') return () => {};
  const visible = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        visible.unobserve(entry.target);
      }
    });
  }, { threshold: REVEAL.threshold });
  const scan = () => container.querySelectorAll(REVEAL.selector).forEach((el) => {
    if (el.classList.contains('visible')) return;
    el.classList.add('reveal');
    visible.observe(el);
  });
  scan();
  const added = typeof MutationObserver === 'undefined' ? null : new MutationObserver(scan);
  added?.observe(container, { childList: true, subtree: true });
  return () => {
    added?.disconnect();
    visible.disconnect();
  };
}

/** A ref for an element whose cards should reveal on scroll. */
export function useReveal() {
  return useCallback((container) => revealWithin(container), []);
}

/**
 * Opt-in scroll reveal for the cards inside one element, without adding any markup:
 *
 *   <Reveal><section className="features">…</section></Reveal>
 *
 * The child must be a single DOM element (it receives the ref). The cards themselves know nothing about it.
 */
export function Reveal({ children }) {
  const ref = useReveal();
  return cloneElement(Children.only(children), { ref });
}
