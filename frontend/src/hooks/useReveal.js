import { useEffect } from 'react';

const SELECTOR = '.pcard, .tcard, .cat-card, .feat-item, .reveal-on-scroll';

/**
 * The homepage's scroll reveal (IntersectionObserver, threshold 0.12), applied to every page.
 * Re-scans when `deps` change so cards rendered after data loads animate in too.
 */
export function useReveal(deps = []) {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(SELECTOR).forEach((el) => {
      if (el.classList.contains('visible')) return;
      el.classList.add('reveal');
      observer.observe(el);
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
