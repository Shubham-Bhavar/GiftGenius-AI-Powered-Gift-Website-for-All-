/**
 * Motion settings shared by the app's animations, in one place. The keyframes themselves live in
 * styles/animations.css; components only opt in (see Reveal.jsx) or read these values.
 */

/** Scroll reveal: which cards fade up into view inside a <Reveal> container, and when (share of the card visible). */
export const REVEAL = {
  selector: '.pcard, .tcard, .cat-card, .feat-item, .reveal-on-scroll',
  threshold: 0.12,
};

/** The AI "thinking" beat, kept even when the answer arrives sooner, so results feel considered rather than instant. */
export const THINKING_MS = {
  quizPage: 900,
  giftFinder: 1100,
};

/** Staggered entrance: the CSS animation-delay for the item at `index` (e.g. AI result cards). */
export function staggerDelay(index, { start = 0.05, step = 0.08 } = {}) {
  return `${start + index * step}s`;
}

/** True when the visitor's system asks for reduced motion. */
export function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}
