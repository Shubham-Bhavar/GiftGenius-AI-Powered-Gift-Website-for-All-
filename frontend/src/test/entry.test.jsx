import { readFileSync, statSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntryAnimation, { entryFraming, entryTheme, prefersStills } from '../components/intro/EntryAnimation.jsx';

const originalPlay = window.HTMLMediaElement.prototype.play;
const intro = () => screen.getByRole('dialog', { name: 'GiftGenius intro' });
const videos = () => [...document.querySelectorAll('.gg-entry video')];
const arrive = () => document.querySelector('.gg-entry-arrive');
const open = () => document.querySelector('.gg-entry-open');
/** Lets the film play, as a browser that autoplays muted video would, and records what was played. */
function filmPlays() {
  const played = [];
  window.HTMLMediaElement.prototype.play = function play() {
    played.push(this.className.includes('gg-entry-open') ? 'open' : 'arrive');
    return Promise.resolve();
  };
  return played;
}
function reducedMotion() {
  window.matchMedia = vi.fn().mockImplementation((q) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  sessionStorage.removeItem('gg-entry-shown');
});
afterEach(() => {
  window.HTMLMediaElement.prototype.play = originalPlay;
  delete window.matchMedia;
  delete navigator.connection;
  document.documentElement.classList.remove('gg-entry-lock');
  delete document.documentElement.dataset.theme;
});

describe('the entry film', () => {
  it('is the studio box settling, then opening when asked, then fading into the page', async () => {
    const played = filmPlays();
    const onFinish = vi.fn();
    render(<EntryAnimation onFinish={onFinish} />);
    expect(intro()).toHaveClass('is-arriving');
    await waitFor(() => expect(played).toEqual(['arrive']));
    expect(screen.getByRole('button', { name: 'Open your gift' })).toHaveFocus();
    expect(screen.getByText('Shubham Creates')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'GiftGenius' })).toBeInTheDocument();

    act(() => { fireEvent(arrive(), new Event('ended')); });
    expect(intro()).toHaveClass('is-waiting');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open your gift' }));
    expect(intro()).toHaveClass('is-opening');
    act(() => { fireEvent(open(), new Event('canplay')); });
    await waitFor(() => expect(played).toEqual(['arrive', 'open']));
    expect(onFinish).not.toHaveBeenCalled();
    act(() => { fireEvent(open(), new Event('ended')); });
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    expect(intro()).toHaveClass('is-leaving');
    expect(sessionStorage.getItem('gg-entry-shown')).toBe('1');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'GiftGenius intro' })).toBeNull());
    // Gone, and the welcome screen was asked for once, not again as it went.
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('opened before the box has landed, waits for it to land, so the film never jumps', async () => {
    const played = filmPlays();
    render(<EntryAnimation onFinish={() => {}} />);
    await waitFor(() => expect(played).toEqual(['arrive']));
    act(() => { fireEvent.keyDown(document, { key: 'Enter' }); });
    expect(intro()).toHaveClass('is-arriving');
    act(() => { fireEvent(arrive(), new Event('ended')); });
    expect(intro()).toHaveClass('is-opening');
    act(() => { fireEvent(open(), new Event('canplay')); });
    await waitFor(() => expect(played).toEqual(['arrive', 'open']));
  });

  it('gives way to the stills if the browser won’t play it', async () => {
    const onFinish = vi.fn();
    render(<EntryAnimation onFinish={onFinish} />);
    await waitFor(() => expect(videos()).toHaveLength(0));
    expect(intro()).toHaveClass('gg-entry--stills', 'is-waiting');
    act(() => { fireEvent.keyDown(document, { key: 'Enter' }); });
    expect(document.querySelector('.gg-entry-end')).toHaveClass('is-shown');
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it('gives way to the stills if the opening film isn’t ready in time', async () => {
    filmPlays();
    const onFinish = vi.fn();
    render(<EntryAnimation onFinish={onFinish} />);
    act(() => { fireEvent(arrive(), new Event('ended')); });
    act(() => { fireEvent.keyDown(document, { key: 'Enter' }); });
    await waitFor(() => expect(intro()).toHaveClass('gg-entry--stills'), { timeout: 4000 });
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });
});

describe('stills instead of the film', () => {
  it('with reduced motion: no film at all, and it moves on quickly', async () => {
    reducedMotion();
    filmPlays();
    const onFinish = vi.fn();
    render(<EntryAnimation onFinish={onFinish} />);
    expect(videos()).toHaveLength(0);
    expect(document.querySelector('.gg-entry-frame')).toHaveClass('is-shown');
    act(() => { fireEvent.keyDown(document, { key: 'Enter' }); });
    await waitFor(() => expect(onFinish).toHaveBeenCalled(), { timeout: 1000 });
  });

  it('the review switch plays the film on a system set to reduced motion, only outside a normal production build', () => {
    reducedMotion();
    expect(prefersStills()).toBe(true);
    window.history.replaceState(null, '', '/?motion=on');
    expect(prefersStills()).toBe(false); // tests run as development
    window.history.replaceState(null, '', '/');
    const source = readFileSync('src/components/intro/EntryAnimation.jsx', 'utf8');
    expect(source).toContain("(import.meta.env.DEV || import.meta.env.VITE_STUDIO_REVIEW === '1')");
  });

  it('when the shopper asks to save data, or the connection is very slow', () => {
    navigator.connection = { saveData: true };
    expect(prefersStills()).toBe(true);
    navigator.connection = { saveData: false, effectiveType: 'slow-2g' };
    expect(prefersStills()).toBe(true);
    navigator.connection = { saveData: false, effectiveType: '4g' };
    expect(prefersStills()).toBe(false);
    navigator.connection = { saveData: true };
    render(<EntryAnimation onFinish={() => {}} />);
    expect(videos()).toHaveLength(0);
  });
});

describe('leaving and coming back', () => {
  it('Skip intro and Escape leave at once, and hand over to the welcome screen', async () => {
    const onFinish = vi.fn();
    const { unmount } = render(<EntryAnimation onFinish={onFinish} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Skip intro' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('gg-entry-shown')).toBe('1');
    unmount();

    sessionStorage.removeItem('gg-entry-shown');
    const second = vi.fn();
    render(<EntryAnimation onFinish={second} />);
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('locks scrolling only while it shows, with a lock of its own that the site’s overlays can’t undo', async () => {
    const { unmount } = render(<EntryAnimation onFinish={() => {}} />);
    expect(document.documentElement).toHaveClass('gg-entry-lock');
    document.body.style.overflow = ''; // what the site's overlay lock does as the page mounts
    expect(document.documentElement).toHaveClass('gg-entry-lock');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Skip intro' }));
    expect(document.documentElement).not.toHaveClass('gg-entry-lock');
    unmount();
  });

  it('never leaves scrolling locked if the page goes before it ends', () => {
    const { unmount } = render(<EntryAnimation onFinish={() => {}} />);
    unmount();
    expect(document.documentElement).not.toHaveClass('gg-entry-lock');
  });

  it('isn’t shown again in the same session', () => {
    sessionStorage.setItem('gg-entry-shown', '1');
    const onFinish = vi.fn();
    render(<EntryAnimation onFinish={onFinish} />);
    expect(screen.queryByRole('dialog', { name: 'GiftGenius intro' })).toBeNull();
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('light and dark', () => {
  it('follows the site’s theme: the dark films and colours on a dark site, the light ones otherwise', () => {
    expect(entryTheme()).toBe('light');
    const { unmount } = render(<EntryAnimation onFinish={() => {}} />);
    expect(intro()).toHaveClass('gg-entry--light');
    expect(arrive().getAttribute('src')).toMatch(/-light\.mp4$/);
    unmount();
    document.documentElement.dataset.theme = 'dark';
    sessionStorage.removeItem('gg-entry-shown');
    render(<EntryAnimation onFinish={() => {}} />);
    expect(intro()).toHaveClass('gg-entry--dark');
    expect(arrive().getAttribute('src')).toBe(`/intro/entry-arrive-${entryFraming(window.innerWidth, window.innerHeight).framing}-dark.mp4`);
    expect(open().getAttribute('src')).toMatch(/-dark\.mp4$/);
  });

  describe('the site’s theme, set before the page paints (theme-init.js)', () => {
    const source = readFileSync('public/theme-init.js', 'utf8');
    const system = (dark) => {
      window.matchMedia = vi.fn().mockImplementation((q) => ({ matches: dark && q.includes('dark'), media: q, addEventListener() {}, removeEventListener() {} }));
    };
    const run = () => {
      new Function(source)();
      return document.documentElement.dataset.theme;
    };
    afterEach(() => localStorage.removeItem('gg-theme'));

    it('follows the system: dark when it’s dark, light when it’s light', () => {
      system(true);
      expect(run()).toBe('dark');
      system(false);
      expect(run()).toBe('light');
    });

    it('the visitor’s own choice from the header toggle wins over the system', () => {
      system(true);
      localStorage.setItem('gg-theme', 'light');
      expect(run()).toBe('light');
    });

    it('still follows the system when the browser blocks storage', () => {
      system(true);
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
      try {
        expect(run()).toBe('dark');
      } finally {
        getItem.mockRestore();
      }
    });
  });
});

describe('the film’s framing and weight', () => {
  it.each([
    [1440, 900, 'wide'], [1920, 1080, 'wide'], [2560, 1080, 'wide'], [844, 390, 'wide'], [390, 844, 'tall'], [768, 1024, 'tall'],
  ])('%ix%i: the %s framing', (w, h, framing) => {
    expect(entryFraming(w, h)).toMatchObject({ framing, arrive: `/intro/entry-arrive-${framing}-light.mp4`, end: `/intro/entry-end-${framing}-light.webp` });
    expect(entryFraming(w, h, 'dark')).toMatchObject({ framing, theme: 'dark', open: `/intro/entry-open-${framing}-dark.mp4`, hold: `/intro/entry-hold-${framing}-dark.webp` });
  });

  it('is always shown whole, between the brand and the button, never under them', () => {
    const css = readFileSync('src/styles/intro/entry.css', 'utf8');
    expect(css).toMatch(/\.gg-entry-stage \{[^}]*grid-row: 2;/);
    expect(css).toMatch(/\.gg-entry-frame \{[^}]*object-fit: contain;/);
    expect(css).not.toMatch(/object-fit: cover/);
  });

  it('sits on the site’s own background for the theme: light teal, or the dark theme’s dark teal', () => {
    const css = readFileSync('src/styles/intro/entry.css', 'utf8');
    const tokens = readFileSync('src/styles/tokens.css', 'utf8');
    const light = tokens.match(/--bg-light:\s*(#[0-9a-f]{6})/i)[1].toLowerCase();
    const dark = tokens.match(/\[data-theme="dark"\] \{[^}]*?--bg:\s*(#[0-9a-f]{6})/i)[1].toLowerCase();
    expect(css).toMatch(new RegExp(`\\.gg-entry \\{[^}]*--entry-room: ${light};`));
    expect(css).toMatch(new RegExp(`\\.gg-entry--dark \\{[^}]*--entry-room: ${dark};`));
    expect(css).toMatch(/background: var\(--entry-room\)/);
    expect(css).toContain('--entry-ink: #0f2225;');
    expect(css).toContain('--entry-gold: #8f5c0e;');
  });

  it.each([['wide', 'light'], ['tall', 'light'], ['wide', 'dark'], ['tall', 'dark']])('%s, %s: every file is there, and a visit downloads well under a megabyte', (framing, theme) => {
    const size = (name) => statSync(`public/intro/entry-${name}-${framing}-${theme}.${name.startsWith('arrive') || name.startsWith('open') ? 'mp4' : 'webp'}`).size;
    const total = ['arrive', 'open', 'hold', 'end'].reduce((sum, name) => sum + size(name), 0);
    expect(total).toBeLessThan(900 * 1024);
  });

  it('needs no 3D code on the homepage: the film was rendered from the studio scene ahead of time', () => {
    const source = readFileSync('src/components/intro/EntryAnimation.jsx', 'utf8');
    expect(source).not.toMatch(/from 'three|scene\//);
  });
});
