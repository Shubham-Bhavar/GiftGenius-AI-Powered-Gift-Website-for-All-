import { afterEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { holdHero, motionAllowed, playHero } from '../animations/heroMotion.js';

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
  document.body.innerHTML = '';
});

/** A browser whose motion setting is `reduced` (true) or not. */
function prefersReducedMotion(reduced) {
  window.matchMedia = (query) => ({
    matches: query.includes('no-preference') ? !reduced : reduced,
    media: query,
    onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  });
}

function hero() {
  document.body.innerHTML = `
    <section class="hero">
      <div class="hero-left">
        <p class="hero-eyebrow">Curated</p><h1>Find the Perfect Gift</h1><p class="hero-desc">Text</p>
        <div class="hero-actions"><a href="#p">Explore</a></div><div class="hero-progress"></div>
        <div class="hero-stats"><div class="stat">1</div></div>
      </div>
      <div class="hero-right"><div class="hero-visual"><div class="img-main"></div><div class="hcard"></div></div></div>
    </section>`;
  return document.querySelector('.hero');
}

describe('homepage hero motion', () => {
  it('does nothing and hides nothing with reduced motion', () => {
    prefersReducedMotion(true);
    const el = hero();
    holdHero(el);
    expect(el.dataset.motion).toBeUndefined();
    const stop = playHero(el);
    expect(el.querySelector('h1').getAttribute('style')).toBeNull();
    stop();
  });

  it('does nothing where the browser can’t say (no matchMedia)', () => {
    window.matchMedia = undefined;
    expect(motionAllowed()).toBe(false);
    const el = hero();
    holdHero(el);
    expect(el.dataset.motion).toBeUndefined();
  });

  it('holds the hero, plays its entrance to fully visible, and puts everything back when stopped', async () => {
    prefersReducedMotion(false);
    const el = hero();
    holdHero(el);
    expect(el.dataset.motion).toBe('pending');
    const stop = playHero(el);
    await waitFor(() => expect(el.dataset.motion).toBeUndefined(), { timeout: 3000 });
    const h1 = el.querySelector('h1');
    await waitFor(() => expect(Number(getComputedStyle(h1).opacity || 1)).toBe(1), { timeout: 3000 });
    stop();
    expect(h1.getAttribute('style') ?? '').toBe(''); // timelines and ScrollTriggers reverted
    expect(el.querySelector('.hero-visual').getAttribute('style') ?? '').toBe('');
  });

  it('plays once per browser session: coming back to the homepage shows the hero at once', () => {
    prefersReducedMotion(false);
    const first = hero();
    holdHero(first);
    playHero(first)();
    const again = hero();
    holdHero(again);
    expect(again.dataset.motion).toBeUndefined();
    playHero(again)();
    expect(again.querySelector('h1').getAttribute('style')).toBeNull();
  });
});
