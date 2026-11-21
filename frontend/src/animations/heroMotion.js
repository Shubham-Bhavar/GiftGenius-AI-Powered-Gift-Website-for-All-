/**
 * The homepage hero's entrance and scroll story, in GSAP. GSAP and ScrollTrigger are loaded here, on the homepage only,
 * as a chunk of their own, so no other page pays for them.
 *
 * - Entrance: the eyebrow, headline, text, buttons and figures come up in sequence while the gift collage settles in.
 * - Scroll: as the hero scrolls away, the collage drifts up a little slower than the page (scrubbed to the scroll).
 *
 * Only transforms and opacity move, so nothing shifts the layout. With reduced motion (or no matchMedia) nothing
 * animates and nothing is hidden. The hero is marked `data-motion="pending"` while it waits for its entrance (CSS
 * keeps the parts invisible then); the mark is always removed, by the timeline or, if GSAP fails to load, by a
 * fail-safe, so content can never stay hidden.
 */

import { session } from '../utils/storage.js';

const PENDING = 'pending';
/** The entrance plays once per browser session; coming back to the homepage shows the hero at once. */
const PLAYED = 'gg-hero-played';
/** If the entrance hasn't started by then (GSAP slow or blocked), show the hero as it is. */
const FAILSAFE_MS = 2500;

export const motionAllowed = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

const entranceDue = () => motionAllowed() && !session.get(PLAYED, 'blocked');

/** Hides the hero's parts until its entrance plays; a no-op when motion isn't wanted. Call before first paint. */
export function holdHero(hero) {
  if (hero && entranceDue()) hero.dataset.motion = PENDING;
}

const reveal = (hero) => {
  if (hero?.dataset.motion === PENDING) delete hero.dataset.motion;
};

/**
 * Plays the entrance and sets up the scroll story inside `hero`. Returns a function that stops everything and puts
 * the hero back as it was (timelines, ScrollTriggers and inline styles are reverted).
 */
export function playHero(hero) {
  if (!hero) return () => {};
  if (!entranceDue()) {
    reveal(hero);
    return () => {};
  }
  session.set(PLAYED, '1');
  let stopped = false;
  let revert = () => {};
  // Until the entrance has finished, the fail-safe shows the hero: before GSAP loads by removing the mark, after by
  // jumping the timeline to its end. That needs no animation frames, which a hidden or throttled page may not get.
  let showNow = () => reveal(hero);
  const failsafe = setTimeout(() => showNow(), FAILSAFE_MS);

  Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([{ gsap }, { ScrollTrigger }]) => {
    if (stopped) return;
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia(hero);
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const q = gsap.utils.selector(hero);
      const parts = q('.hero-eyebrow, .hero-left h1, .hero-desc, .hero-actions, .hero-progress, .hero-stats .stat');
      const collage = q('.hero-visual');
      const tiles = q('.img-main, .img-tl, .img-tr, .img-bl, .img-br, .hcard, .gift-ribbon');
      gsap.set([...parts, ...collage], { autoAlpha: 0 });
      reveal(hero); // GSAP holds the starting state from here

      const entrance = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.7 }, onComplete: () => clearTimeout(failsafe) });
      showNow = () => entrance.progress(1);
      entrance
        .fromTo(parts, { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.08 })
        .fromTo(collage, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.9 }, 0.15)
        // The tiles only fade in turn: their transform belongs to their CSS centring and float animations.
        .fromTo(tiles, { autoAlpha: 0 }, { autoAlpha: 1, stagger: 0.07, duration: 0.6, clearProps: 'opacity,visibility' }, 0.3);

      // Transforms go on the collage wrapper, never on the tiles.
      gsap.to(collage, {
        yPercent: -10,
        ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.6 },
      });
    });
    revert = () => mm.revert();
  }).catch(() => reveal(hero));

  return () => {
    stopped = true;
    clearTimeout(failsafe);
    revert();
    reveal(hero);
  };
}
