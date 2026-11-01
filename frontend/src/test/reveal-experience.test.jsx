import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from './renderApp.jsx';
import { db } from './setup.js';
import { sanitizeConfig, shareFragment, themeLook } from '../components/studio/look.js';
import { bowKnot, bowLoop } from '../components/studio/experiences/ribbonGeometry.js';
import { STAGES, animationReducer, useGiftAnimation } from '../components/studio/experiences/useGiftAnimation.js';
import { faceShades } from '../components/studio/experiences/useTurntable.js';

const DURATIONS = { entrance: 100, rotation: 200, ribbon: 300, lid: 400, reveal: 500 };
const rawShare = (link) => JSON.parse(Buffer.from(new URL(link).hash.replace('#gift=', ''), 'base64url').toString('utf8'));

/** The window's reduced-motion setting, for tests that need it on. */
function reducedMotion() {
  const original = window.matchMedia;
  window.matchMedia = (q) => ({ matches: String(q).includes('reduced-motion'), addEventListener() {}, removeEventListener() {} });
  return () => { window.matchMedia = original; };
}

describe('the reveal state machine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const setup = (options) => renderHook(() => useGiftAnimation(DURATIONS, options));
  const tick = (ms) => act(() => { vi.advanceTimersByTime(ms); });
  const call = (hook, name) => act(() => { hook.result.current[name](); });

  it('runs the five stages in order, each for its own time, then finishes', () => {
    const hook = setup();
    expect(hook.result.current).toMatchObject({ status: 'idle', stageName: null });
    call(hook, 'play');
    const seen = [hook.result.current.stageName];
    for (const stage of STAGES) {
      tick(DURATIONS[stage] - 1);
      expect(hook.result.current.stageName).toBe(stage); // not a moment early
      tick(1);
      seen.push(hook.result.current.stageName);
    }
    expect(seen).toEqual(['entrance', 'rotation', 'ribbon', 'lid', 'reveal', 'reveal']);
    expect(hook.result.current.status).toBe('finished');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pausing holds the stage and keeps what was left of it', () => {
    const hook = setup();
    call(hook, 'play');
    tick(60); // 40 of the entrance's 100 left
    call(hook, 'pause');
    expect(hook.result.current.status).toBe('paused');
    expect(vi.getTimerCount()).toBe(0);
    tick(5000);
    expect(hook.result.current.stageName).toBe('entrance');
    call(hook, 'play');
    tick(39);
    expect(hook.result.current.stageName).toBe('entrance');
    tick(1);
    expect(hook.result.current.stageName).toBe('rotation');
  });

  it('replay restarts from the first stage, with a new run so the animations play again', () => {
    const hook = setup();
    call(hook, 'play');
    tick(350);
    const { run } = hook.result.current;
    call(hook, 'replay');
    expect(hook.result.current).toMatchObject({ stageName: 'entrance', status: 'playing' });
    expect(hook.result.current.run).toBeGreaterThan(run);
    tick(99);
    expect(hook.result.current.stageName).toBe('entrance'); // a full stage again, not what was left of the old one
  });

  it('skip goes straight to the final reveal, instantly, and leaves no timer running', () => {
    const hook = setup();
    call(hook, 'play');
    call(hook, 'skip');
    expect(hook.result.current).toMatchObject({ stageName: 'reveal', status: 'finished', instant: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reset returns to the closed box, from any stage, paused or not', () => {
    const hook = setup();
    call(hook, 'play');
    tick(150);
    call(hook, 'pause');
    call(hook, 'reset');
    expect(hook.result.current).toMatchObject({ stageName: null, status: 'idle' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer when it goes away', () => {
    const hook = setup({ autoPlay: true });
    expect(hook.result.current.stageName).toBe('entrance');
    expect(vi.getTimerCount()).toBe(1);
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('with reduced motion, each stage holds as a still for the same short time', () => {
    const restore = reducedMotion();
    const hook = renderHook(() => useGiftAnimation({ entrance: 9000, rotation: 9000, ribbon: 9000, lid: 9000, reveal: 9000 }));
    call(hook, 'play');
    tick(899);
    expect(hook.result.current.stageName).toBe('entrance');
    tick(1);
    expect(hook.result.current.stageName).toBe('rotation');
    restore();
  });

  it('ignores actions that make no sense in the current state', () => {
    const idle = { stage: null, status: 'idle', instant: false, run: 0 };
    expect(animationReducer(idle, { type: 'pause' })).toBe(idle);
    expect(animationReducer(idle, { type: 'advance' })).toBe(idle);
    const paused = { ...idle, stage: 2, status: 'paused' };
    expect(animationReducer(paused, { type: 'advance' })).toBe(paused);
  });
});

describe('box geometry and light', () => {
  it('a bow loop leaves the knot, reaches out and comes back, lit on top and shadowed beneath', () => {
    const loop = bowLoop({ length: 60, height: 30, segments: 16 });
    expect(loop).toHaveLength(16);
    expect(Math.max(...loop.map((s) => s.x))).toBeGreaterThan(50);
    expect(Math.min(...loop.map((s) => s.x))).toBeLessThan(5);
    expect(loop.every((s) => s.length > 0)).toBe(true);
    const topMost = loop.reduce((a, b) => (b.y < a.y ? b : a));
    const underside = loop.reduce((a, b) => (b.y > a.y ? b : a));
    expect(topMost.dark).toBeLessThan(underside.dark);
  });

  it('the knot wraps all the way round', () => {
    const knot = bowKnot({ width: 16, height: 14, segments: 12 });
    expect(knot).toHaveLength(12);
    expect(Math.min(...knot.map((s) => s.y))).toBeLessThan(0);
    expect(Math.max(...knot.map((s) => s.y))).toBeGreaterThan(0);
  });

  it('walls darken as they turn away from the light', () => {
    const facingLight = faceShades(-28);
    expect(Number(facingLight.front)).toBe(0);
    expect(Number(facingLight.back)).toBeGreaterThan(Number(facingLight.right));
    expect(Number(faceShades(62).front)).toBeGreaterThan(Number(facingLight.front));
  });

  it('the stage adapts to narrow screens by its own width (checked at 375 px in a real browser)', () => {
    const royalCss = readFileSync('src/styles/studio/reveal-experiences.css', 'utf8'); // the tests' config blanks CSS imports
    expect(royalCss).toMatch(/@container \(max-width: 640px\)[\s\S]*--final-x: 0px/);
    expect(royalCss).toMatch(/@container \(max-width: 420px\)/);
    expect(royalCss).toMatch(/\.xp-viewport[^}]*touch-action: pan-y/); // a drag doesn't trap the page's scrolling
  });
});

describe('choosing the reveal in the Gift Studio', () => {
  const open = async (path = '/studio?product=4&budget=1500') => {
    const app = renderApp(path);
    await screen.findByRole('heading', { name: 'Choose Your Reveal Experience' });
    await screen.findByRole('button', { name: 'Use This Experience: Royal Luxury Reveal' });
    return app;
  };
  const useRoyal = (user) => user.click(screen.getByRole('button', { name: 'Use This Experience: Royal Luxury Reveal' }));
  const player = () => screen.getByRole('group', { name: /^Royal Luxury Reveal:/ });
  const controls = () => within(screen.getByRole('group', { name: 'Reveal controls' }));

  it('lists each experience with its description and theme, and the classic reveal stays the default', async () => {
    await open();
    const section = screen.getByRole('heading', { name: 'Choose Your Reveal Experience' }).closest('section');
    const cards = within(section).getAllByRole('listitem');
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual(['Classic reveal', 'Royal Luxury Reveal', 'Birthday Surprise', 'Sentimental Unboxing', 'Minimal Aesthetic', 'Personalised Memory Reveal']);
    const royal = within(cards[1]);
    expect(royal.getByText('Black, emerald and gold')).toBeInTheDocument();
    expect(royal.getByText(/A hinged black box/)).toBeInTheDocument();
    expect(royal.getByRole('button', { name: 'Preview Experience: Royal Luxury Reveal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In use: Classic reveal' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Step 1 of 7')).toBeInTheDocument(); // the existing player, unchanged
    expect(screen.queryByRole('group', { name: /^Royal Luxury Reveal:/ })).not.toBeInTheDocument();
  });

  it('switching experiences keeps the gift, name, message, look and tab: nothing else resets', async () => {
    const { user } = await open();
    await user.type(screen.getByLabelText('Their name'), 'Aditi');
    await user.type(screen.getByLabelText('Card message'), 'Thank you');
    await user.click(within(screen.getByRole('group', { name: 'Box colour' })).getByRole('radio', { name: 'Teal' }));

    await useRoyal(user);
    expect(player()).toBeInTheDocument();
    expect(screen.getByText(/your box colours and wrap apply to the classic reveal/)).toBeInTheDocument();
    expect(screen.getByLabelText('Their name')).toHaveValue('Aditi');
    expect(screen.getByLabelText('Card message')).toHaveValue('Thank you');

    await user.click(screen.getByRole('button', { name: 'Use This Experience: Classic reveal' }));
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
    expect(screen.getByText('Aditi')).toBeInTheDocument(); // "A gift for Aditi"
    expect(within(screen.getByRole('group', { name: 'Box colour' })).getByRole('radio', { name: 'Teal' })).toBeChecked();
    await user.click(screen.getByRole('tab', { name: 'Your view' }));
    expect(screen.getByRole('group', { name: /^Teal box/ })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Signature Perfume' })).toBeInTheDocument();
  });

  it('preview plays straight away without changing the choice', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Preview Experience: Royal Luxury Reveal' }));
    expect(controls().getByRole('button', { name: 'Pause' })).toBeInTheDocument(); // already playing
    expect(screen.getByRole('button', { name: 'In use: Classic reveal' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Preview Experience: Classic reveal' }));
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
  });

  it('the controls: play, pause, resume, skip, replay and reset', async () => {
    const { user } = await open();
    await useRoyal(user);
    expect(controls().getByRole('button', { name: 'Reset' })).toBeDisabled(); // nothing to reset yet
    await user.click(controls().getByRole('button', { name: 'Play' }));
    expect(screen.getByText('Arrival')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('A black gift box tied in gold ribbon arrives.')).toBeInTheDocument();
    await user.click(controls().getByRole('button', { name: 'Pause' }));
    await user.click(controls().getByRole('button', { name: 'Resume' }));
    await user.click(controls().getByRole('button', { name: 'Skip reveal' }));
    expect(screen.getByText('Reveal')).toHaveAttribute('aria-current', 'step');
    expect(controls().getByRole('button', { name: 'Skip reveal' })).toBeDisabled();
    await user.click(controls().getByRole('button', { name: 'Replay' }));
    expect(screen.getByText('Arrival')).toHaveAttribute('aria-current', 'step');
    await user.click(controls().getByRole('button', { name: 'Reset' }));
    expect(controls().getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByText('Arrival')).not.toHaveAttribute('aria-current');
  });

  it('resuming from a pause during the arrival carries on, rather than swinging back to its start', async () => {
    const { user } = await open();
    await useRoyal(user);
    const scene = document.querySelector('.xp-scene');
    await user.click(controls().getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(Number.parseFloat(scene.style.getPropertyValue('--ry'))).toBeGreaterThan(-71));
    await user.click(controls().getByRole('button', { name: 'Pause' }));
    const held = Number.parseFloat(scene.style.getPropertyValue('--ry'));
    await user.click(controls().getByRole('button', { name: 'Resume' }));
    expect(Number.parseFloat(scene.style.getPropertyValue('--ry'))).toBeGreaterThanOrEqual(held);
  });

  it('the final reveal shows their real gift, name and message, with no price or budget anywhere', async () => {
    const { user } = await open();
    await user.type(screen.getByLabelText('Their name'), 'Aditi');
    await user.type(screen.getByLabelText('Card message'), 'Thank you for everything.');
    await useRoyal(user);
    await user.click(controls().getByRole('button', { name: 'Skip reveal' }));

    const stage = document.querySelector('.xp');
    const caption = within(stage.querySelector('.xp-caption'));
    expect(caption.getByText('For Aditi')).toBeInTheDocument();
    expect(caption.getByText('Signature Perfume')).toBeInTheDocument();
    expect(caption.getByText('Thank you for everything.')).toBeInTheDocument();
    expect(stage.querySelector('.xp-foil-name')).toHaveTextContent('For Aditi');
    expect(stage.querySelector('.xp-gift img')).toHaveAttribute('src', db.products[2].image);
    expect(stage.textContent).not.toMatch(/₹|1,?199|1,?500|budget/i);
  });

  it('invents nothing: with no name or message, none is shown', async () => {
    const { user } = await open();
    await useRoyal(user);
    await user.click(controls().getByRole('button', { name: 'Skip reveal' }));
    const stage = document.querySelector('.xp');
    expect(stage.querySelector('.xp-caption-for')).toBeNull();
    expect(stage.querySelector('.xp-caption-message')).toBeNull();
    expect(stage.querySelector('.xp-caption-photo')).toBeNull();
    expect(stage.querySelector('.xp-foil-name')).toBeNull();
    expect(stage.querySelector('.xp-caption-gift')).toHaveTextContent('Signature Perfume');
  });

  it('uses the shopper\'s own photo, kept on the device', async () => {
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = vi.fn(() => 'blob:http://localhost/photo-1');
    URL.revokeObjectURL = vi.fn();
    try {
      const { user } = await open();
      await user.upload(screen.getByLabelText(/Your photos/), new File(['a'], 'a.png', { type: 'image/png' }));
      const before = db.calls.length;
      await useRoyal(user);
      await user.click(controls().getByRole('button', { name: 'Skip reveal' }));
      expect(document.querySelector('.xp-caption-photo')).toHaveAttribute('src', 'blob:http://localhost/photo-1');
      expect(db.calls.slice(before).filter((c) => c.method !== 'GET')).toEqual([]); // nothing was sent anywhere
    } finally {
      Object.assign(URL, { createObjectURL: original.create, revokeObjectURL: original.revoke });
    }
  });

  it('a printed name appears only on a gift the catalogue says can be personalised', async () => {
    const config = sanitizeConfig({ ...themeLook('midnight'), products: [4], engraving: 'A.R.' });
    const first = await open(`/studio#${shareFragment(config, 'friends')}`);
    await useRoyal(first.user);
    await first.user.click(controls().getByRole('button', { name: 'Skip reveal' }));
    expect(document.querySelector('.xp-caption-printed')).toBeNull();
    first.unmount();

    db.products[2].tags = ['personalized'];
    const second = await open(`/studio#${shareFragment(config, 'friends')}`);
    await useRoyal(second.user);
    await second.user.click(controls().getByRole('button', { name: 'Skip reveal' }));
    expect(document.querySelector('.xp-caption-printed')).toHaveTextContent('Printed “A.R.” on the Signature Perfume');
  });

  it('share links keep their contract: the choice isn\'t in them, and a surprise link has no budget', async () => {
    const { user, unmount } = await open();
    await useRoyal(user);
    await user.click(screen.getByRole('button', { name: '🎁 Send as a surprise preview' }));
    const link = screen.getByLabelText('Share link').value;
    const raw = rawShare(link);
    expect(Object.keys(raw).sort()).toEqual(['box', 'card', 'message', 'name', 'order', 'pattern', 'products', 'ribbon', 'template', 'theme', 'v', 'view']);
    unmount();

    // Opened by them: the existing reveal, and nothing to choose.
    renderApp(`/studio${new URL(link).hash}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'A gift preview, just for you' })).toBeInTheDocument();
    expect(await screen.findByText('Step 1 of 7')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Choose Your Reveal Experience' })).not.toBeInTheDocument();
    expect(screen.getByRole('main').textContent).not.toMatch(/₹/);
  });

  it('Add to cart is unchanged: only the card message goes with the order, in any experience', async () => {
    const { user } = await open();
    await user.type(screen.getByLabelText('Card message'), 'For you');
    await useRoyal(user);
    await user.click(screen.getByRole('tab', { name: 'Your view' }));
    await user.click(await screen.findByRole('button', { name: '🛒 Add to cart' }));
    await waitFor(() => expect(screen.getByTestId('cart-count')).toHaveTextContent('1'));
    const [line] = JSON.parse(localStorage.getItem('gg-cart'));
    expect(line).toMatchObject({ productId: 4, customMessage: 'For you', customName: null });
    for (const key of ['experience', 'theme', 'box', 'ribbon']) expect(line).not.toHaveProperty(key);
  });

  it('works from the keyboard: the box turns with the arrow keys, and every control is reachable', async () => {
    const restore = reducedMotion(); // turns land at once, so the test can read them
    try {
      const { user } = await open();
      await useRoyal(user);
      const box = player();
      expect(box).toHaveAttribute('tabindex', '0');
      expect(box).toHaveAccessibleDescription('Drag the box, or use the arrow keys, to turn it all the way round.');
      const scene = document.querySelector('.xp-scene');
      const turn = () => Number.parseFloat(scene.style.getPropertyValue('--ry'));
      const tilt = () => Number.parseFloat(scene.style.getPropertyValue('--rx'));
      const start = turn();
      box.focus();
      await user.keyboard('{ArrowRight}');
      expect(turn()).toBeCloseTo(start + 15);
      await user.keyboard('{ArrowLeft}{ArrowLeft}');
      expect(turn()).toBeCloseTo(start - 15);
      const level = tilt();
      await user.keyboard('{ArrowDown}');
      expect(tilt()).toBeCloseTo(level - 6);

      await user.tab();
      expect(controls().getByRole('button', { name: 'Play' })).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(controls().getByRole('button', { name: 'Pause' })).toHaveFocus(); // the same button, now pausing
      await user.keyboard(' ');
      expect(controls().getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('with reduced motion, the box doesn\'t swing: it lands on each pose at once', async () => {
    const restore = reducedMotion();
    try {
      const { user } = await open();
      await useRoyal(user);
      const scene = document.querySelector('.xp-scene');
      expect(scene.style.getPropertyValue('--ry')).toBe('-30.00deg');
      await user.click(controls().getByRole('button', { name: 'Skip reveal' }));
      expect(scene.style.getPropertyValue('--ry')).toBe('-18.00deg');
      expect(scene.style.getPropertyValue('--rx')).toBe('-18.00deg');
    } finally {
      restore();
    }
  });
});
