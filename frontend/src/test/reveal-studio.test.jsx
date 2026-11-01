import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from './renderApp.jsx';
import { db } from './setup.js';
import { EXPERIENCES } from '../components/studio/experiences/experiences.js';
import { STAGES } from '../components/studio/experiences/useGiftAnimation.js';
import { dialAngle } from '../components/studio/experiences/useTurntable.js';

const NAMES = Object.values(EXPERIENCES).map((e) => e.name);

function reducedMotion() {
  const original = window.matchMedia;
  window.matchMedia = (q) => ({ matches: String(q).includes('reduced-motion'), addEventListener() {}, removeEventListener() {} });
  return () => { window.matchMedia = original; };
}

const open = async (path = '/studio?product=4&budget=1500') => {
  const app = renderApp(path);
  await screen.findByRole('button', { name: 'Use This Experience: Royal Luxury Reveal' });
  return app;
};
const choose = (user, name) => user.click(screen.getByRole('button', { name: `Use This Experience: ${name}` }));
const controls = () => within(screen.getByRole('group', { name: 'Reveal controls' }));
const skip = (user) => user.click(controls().getByRole('button', { name: 'Skip reveal' }));
const root = () => document.querySelector('.xp');
const yaw = () => Number.parseFloat(document.querySelector('.xp-scene').style.getPropertyValue('--ry'));

describe('the five reveal experiences', () => {
  it('there are five, each with its own stage timing, camera and look', () => {
    expect(NAMES).toEqual(['Royal Luxury Reveal', 'Birthday Surprise', 'Sentimental Unboxing', 'Minimal Aesthetic', 'Personalised Memory Reveal']);
    const totals = Object.values(EXPERIENCES).map((e) => STAGES.reduce((sum, stage) => sum + e.durations[stage], 0));
    expect(new Set(totals).size).toBe(5);
    for (const e of Object.values(EXPERIENCES)) {
      for (const stage of STAGES) expect(e.durations[stage]).toBeGreaterThan(0);
      for (const stage of [...STAGES, 'idle', 'start']) expect(e.poses[stage]).toBeDefined();
    }
  });

  it.each(NAMES)('%s: shows the real gift and the real words, with no price or budget', async (name) => {
    const { user } = await open();
    await user.type(screen.getByLabelText('Their name'), 'Aditi');
    await user.type(screen.getByLabelText('Card message'), 'Thank you for everything.');
    await choose(user, name);
    expect(screen.getByRole('group', { name: new RegExp(`^${name}:`) })).toBeInTheDocument();
    await skip(user);
    const caption = root().querySelector('.xp-caption');
    expect(caption).toHaveTextContent('Aditi');
    expect(caption).toHaveTextContent('Signature Perfume');
    expect(caption).toHaveTextContent('Thank you for everything.');
    expect(root().querySelector('.xp-gift img')).toHaveAttribute('src', db.products[2].image);
    expect(root().querySelector('.xp-stage').textContent).not.toMatch(/₹|1,?199|1,?500|budget/i);
    expect(screen.getByLabelText('Card message')).toHaveValue('Thank you for everything.');
  });

  it.each(NAMES.filter((n) => n !== 'Birthday Surprise'))('%s: with no name or message, none is invented', async (name) => {
    const { user } = await open();
    await choose(user, name);
    await skip(user);
    for (const part of ['.xp-caption-for', '.xp-caption-message', '.xp-card', '.xp-foil-name', '.xp-print', '.xp-caption-photo']) {
      expect(root().querySelector(part)).toBeNull();
    }
    expect(root().querySelector('.xp-caption-gift')).toHaveTextContent('Signature Perfume');
  });

  it('Birthday Surprise: a birthday card with their name and message, or just the greeting without them', async () => {
    const { user } = await open();
    await choose(user, 'Birthday Surprise');
    await skip(user);
    expect(root().querySelector('.xp-card-heading').textContent).toBe('Happy birthday');
    expect(root().querySelector('.xp-caption-message')).toBeNull();
    await user.type(screen.getByLabelText('Their name'), 'Aditi');
    await user.type(screen.getByLabelText('Card message'), 'Many happy returns');
    expect(root().querySelector('.xp-card-heading').textContent).toBe('Happy birthday, Aditi');
    expect(root().querySelector('.xp-card')).toHaveTextContent('Many happy returns');
  });

  it('Birthday Surprise: one burst of confetti when the lid pops, not on a skip', async () => {
    const { user } = await open();
    await choose(user, 'Birthday Surprise');
    await skip(user);
    expect(document.querySelector('.xp-confetti')).toBeNull();
    await user.click(controls().getByRole('button', { name: 'Replay' }));
    expect(document.querySelector('.xp-confetti')).toBeNull(); // not before the lid
    await waitFor(() => expect(document.querySelectorAll('.xp-confetti i')).toHaveLength(24), { timeout: 8000 });
  }, 20000);

  it('no confetti with reduced motion', async () => {
    const restore = reducedMotion();
    try {
      const { user } = await open();
      await choose(user, 'Birthday Surprise');
      await user.click(controls().getByRole('button', { name: 'Play' }));
      await waitFor(() => expect(screen.getByText('Lid')).toHaveAttribute('aria-current', 'step'), { timeout: 8000 });
      expect(document.querySelector('.xp-confetti')).toBeNull();
    } finally {
      restore();
    }
  }, 20000);

  it('Sentimental Unboxing: the message comes first, when there is one, and the ribbon is slow', async () => {
    const { user } = await open();
    await choose(user, 'Sentimental Unboxing');
    await skip(user);
    expect(root()).not.toHaveClass('has-card');
    await user.type(screen.getByLabelText('Card message'), 'Always');
    expect(root()).toHaveClass('has-card');
    expect(root().querySelector('.xp-card')).toHaveTextContent('Always');
    expect(EXPERIENCES.sentimental.durations.ribbon).toBeGreaterThan(EXPERIENCES.royal.durations.ribbon);
  });

  it('Minimal Aesthetic: one thin band and a small knot, with no bow loops, tails or card', async () => {
    const { user } = await open();
    await choose(user, 'Minimal Aesthetic');
    const box = root();
    expect(box.querySelectorAll('.xp-loop')).toHaveLength(0);
    expect(box.querySelectorAll('.xp-tail')).toHaveLength(0);
    expect(box.querySelectorAll('.xp-knot')).toHaveLength(1);
    expect(box.querySelectorAll('.xp-band--top')).toHaveLength(0); // across only, no cross
    expect(box.querySelector('.xp-band--wall').style.width).toBe('9px');
    await skip(user);
    expect(box.querySelector('.xp-card')).toBeNull();
  });

  it('Personalised Memory Reveal: uses the shopper\'s own photo, or asks for one and shows nothing in its place', async () => {
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = vi.fn(() => 'blob:http://localhost/photo-1');
    URL.revokeObjectURL = vi.fn();
    try {
      const { user } = await open();
      await choose(user, 'Personalised Memory Reveal');
      expect(screen.getByText(/made for your photo/)).toBeInTheDocument();
      expect(root().querySelector('.xp-print')).toBeNull();

      await user.upload(screen.getByLabelText(/Your photos/), new File(['a'], 'a.png', { type: 'image/png' }));
      expect(screen.queryByText(/made for your photo/)).not.toBeInTheDocument();
      const prints = root().querySelectorAll('.xp-print');
      expect(prints).toHaveLength(2); // on the lid, and inside it
      prints.forEach((img) => expect(img).toHaveAttribute('src', 'blob:http://localhost/photo-1'));
      await skip(user);
      expect(root().querySelector('.xp-caption-print')).toHaveAttribute('src', 'blob:http://localhost/photo-1');

      await user.click(screen.getByRole('button', { name: '🔗 Share with friends' }));
      expect(screen.getByLabelText('Share link').value).not.toContain('blob'); // never in a link
    } finally {
      Object.assign(URL, { createObjectURL: original.create, revokeObjectURL: original.revoke });
    }
  });

  it('only the Memory experience prints the photo on the box; the others show it beside the gift', async () => {
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = vi.fn(() => 'blob:http://localhost/photo-1');
    URL.revokeObjectURL = vi.fn();
    try {
      const { user } = await open();
      await user.upload(screen.getByLabelText(/Your photos/), new File(['a'], 'a.png', { type: 'image/png' }));
      await choose(user, 'Royal Luxury Reveal');
      expect(root().querySelector('.xp-print')).toBeNull();
      await skip(user);
      expect(root().querySelector('.xp-caption-photo')).toHaveAttribute('src', 'blob:http://localhost/photo-1');
    } finally {
      Object.assign(URL, { createObjectURL: original.create, revokeObjectURL: original.revoke });
    }
  });

  it('switching experiences starts the new one closed, with the same gift', async () => {
    const { user } = await open();
    await choose(user, 'Royal Luxury Reveal');
    await skip(user);
    await choose(user, 'Minimal Aesthetic');
    expect(root()).toHaveClass('xp-minimal');
    expect(controls().getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(root().querySelector('.xp-gift img')).toHaveAttribute('src', db.products[2].image);
  });
});

describe('the 360° studio view', () => {
  it('the set: a backdrop with softboxes, a turntable, and a reflection that repeats no content', async () => {
    const { user } = await open();
    await user.type(screen.getByLabelText('Their name'), 'Aditi');
    await choose(user, 'Royal Luxury Reveal');
    const box = root();
    expect(box.querySelectorAll('.xp-softbox')).toHaveLength(2);
    expect(box.querySelector('.xp-disc')).not.toBeNull();
    expect(box.querySelectorAll('.xp-disc-edge').length).toBeGreaterThan(20);
    const mirror = box.querySelector('.xp-mirror');
    expect(mirror.querySelectorAll('.xp-wall').length).toBeGreaterThan(0);
    expect(mirror.querySelector('img, .xp-foil-name, .xp-seg')).toBeNull();
    expect(mirror.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('the dial goes to any angle, the short way round, and announces it', async () => {
    const { user } = await open();
    await choose(user, 'Royal Luxury Reveal');
    const dial = screen.getByRole('slider', { name: 'Turn the box' });
    expect(dial).toHaveValue('330'); // the opening view: -30°
    fireEvent.input(dial, { target: { value: '180' } });
    expect(yaw()).toBeCloseTo(-180);
    expect(dial).toHaveAttribute('aria-valuetext', '180 degrees');
    fireEvent.input(dial, { target: { value: '10' } });
    expect(dialAngle(yaw())).toBe(10);
    expect(Math.abs(yaw() + 180)).toBeLessThanOrEqual(180); // never more than half a turn
    expect(dialAngle(-30)).toBe(330);
    expect(dialAngle(725)).toBe(5);
  });

  it('the turntable spins the box, and stops when asked', async () => {
    const { user } = await open();
    await choose(user, 'Royal Luxury Reveal');
    const start = yaw();
    const button = screen.getByRole('button', { name: '360° Studio View' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);
    expect(screen.getByRole('button', { name: 'Stop turntable' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(yaw()).toBeGreaterThan(start + 1));
    await user.click(screen.getByRole('button', { name: 'Stop turntable' }));
    expect(screen.getByRole('button', { name: '360° Studio View' })).toBeInTheDocument();
  });

  it('starting it pauses a playing reveal, and resuming the reveal stops the turntable', async () => {
    const { user } = await open();
    await choose(user, 'Royal Luxury Reveal');
    await user.click(controls().getByRole('button', { name: 'Play' }));
    await user.click(screen.getByRole('button', { name: '360° Studio View' }));
    expect(controls().getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    await user.click(controls().getByRole('button', { name: 'Resume' }));
    expect(screen.getByRole('button', { name: '360° Studio View' })).toHaveAttribute('aria-pressed', 'false');
    expect(controls().getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('with reduced motion there is no motor, but the dial still turns the box by hand', async () => {
    const restore = reducedMotion();
    try {
      const { user } = await open();
      await choose(user, 'Royal Luxury Reveal');
      expect(screen.queryByRole('button', { name: '360° Studio View' })).not.toBeInTheDocument();
      fireEvent.input(screen.getByRole('slider', { name: 'Turn the box' }), { target: { value: '90' } });
      expect(dialAngle(yaw())).toBe(90);
    } finally {
      restore();
    }
  });

  it('the motor stops with the player: no frame keeps running after it goes', async () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const { user, unmount } = await open();
    await choose(user, 'Royal Luxury Reveal');
    await user.click(screen.getByRole('button', { name: '360° Studio View' }));
    const start = yaw();
    await waitFor(() => expect(yaw()).toBeGreaterThan(start));
    unmount();
    expect(cancel).toHaveBeenCalled();
  });
});

describe('stylesheet rules that were bugs once', () => {
  const css = () => readFileSync('src/styles/studio/reveal-experiences.css', 'utf8');
  const names = (text) => new Set([...text.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

  it('no experience variable shadows a site token (one hid the Replay button in light theme)', () => {
    const tokens = names(readFileSync('src/styles/tokens.css', 'utf8'));
    expect([...names(css())].filter((n) => tokens.has(n))).toEqual([]);
  });

  it('no entrance animates opacity on the box body (one flattened its 3D)', () => {
    const keyframes = readFileSync('src/styles/animations.css', 'utf8');
    const arrivals = [...css().matchAll(/--arrive:\s*(\w+)/g)].map((m) => m[1]);
    expect(arrivals.length).toBeGreaterThan(0);
    for (const name of new Set(['xpArrive', ...arrivals])) {
      const start = keyframes.indexOf(`@keyframes ${name} `);
      expect(start).toBeGreaterThan(-1);
      let depth = 0;
      let end = start;
      do {
        end = keyframes.slice(end + 1).search(/[{}]/) + end + 1;
        depth += keyframes[end] === '{' ? 1 : -1;
      } while (depth > 0);
      expect(keyframes.slice(start, end)).not.toMatch(/opacity/);
    }
  });

  it('the ribbon bands on the lid keep their 3D placement (making all bands relative once removed them)', () => {
    expect(css()).not.toMatch(/\.xp-band \{[^}]*position: relative/);
  });
});
