import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompareLab, compareRows } from '../components/studio/CompareLab.jsx';
import { CompareStage } from '../components/studio/scene/CompareStage3D.jsx';
import { INIT_LIMIT_MS } from '../components/studio/scene/StudioStage3D.jsx';
import { createCompareScene } from '../components/studio/scene/compareScene.js';
import { FINISHES, hexToInt, luminance, SIDE_BY_SIDE_FROM, splitRects, themeLook as studioLook } from '../components/studio/scene/compareLooks.js';
import { LID_OPEN_DEG, openStateAt, OPEN_STAGES, stateAt } from '../components/studio/scene/choreography.js';
import { DARK_SET, LOOKS } from '../components/studio/scene/looks.js';
import { measureCpu, PROBE_BUDGET_MS, verdict } from '../components/studio/scene/quality.js';
import { CARD_PAPERS, WRAP_TILE } from '../components/studio/scene/studioMaterials.js';
import { CARD_STYLES, PATTERNS, sanitizeConfig, THEME_KEYS, THEMES, themeLook } from '../components/studio/look.js';

vi.mock('../components/studio/scene/compareScene.js', () => ({ createCompareScene: vi.fn() }));
vi.mock('../components/studio/scene/quality.js', async (importOriginal) => ({ ...await importOriginal(), measureCpu: vi.fn() }));

const perfume = { id: 4, name: 'Signature Perfume', image: 'https://img.example/perfume.jpg', price: 1199 };
const hamper = { id: 1, name: 'Luxury Hamper Box', image: 'https://img.example/hamper.jpg', price: 499 };
const config = (over = {}) => sanitizeConfig({ ...themeLook('midnight'), products: [4], name: 'Aditi', message: 'With love', budget: 1500, ...over });
const withTheme = (c, key) => ({ ...c, ...themeLook(key) });
const fakeScene = (over = {}) => ({
  setOption: vi.fn(() => Promise.resolve(null)), setOpen: vi.fn(), setSpin: vi.fn(), setDragging: vi.fn(), turnBy: vi.fn(), front: vi.fn(),
  setVisible: vi.fn(), resize: vi.fn(), dispose: vi.fn(), stills: vi.fn(() => Promise.resolve([])), info: vi.fn(() => ({})), tooSlow: false, ...over,
});

class Observer {
  observe() {}

  disconnect() {}
}
function withWebGL(scene = fakeScene()) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind) => (kind === 'webgl2' ? {} : null));
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  createCompareScene.mockResolvedValue(scene);
  return scene;
}
const withoutWebGL = () => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
function reducedMotion() {
  const original = window.matchMedia;
  window.matchMedia = (q) => ({ matches: String(q).includes('reduced-motion'), addEventListener() {}, removeEventListener() {} });
  return () => { window.matchMedia = original; };
}

const optionsFor = (a = config(), b = withTheme(config(), 'minimal'), bItems = [perfume]) => [
  { key: 'A', caption: 'Your box now · Midnight Luxury', config: a, items: [perfume] },
  { key: 'B', caption: 'Minimal Elegance', config: b, items: bItems },
];
const stillsFor = THEME_KEYS.map((key) => ({ key, config: withTheme(config(), key) }));
const noPhotos = [];
const stage = (props = {}) => <CompareStage options={optionsFor()} photos={noPhotos} stillsFor={stillsFor} onStills={() => {}} {...props} />;
const ready = () => screen.findByRole('group', { name: /^Option A: Midnight Luxury/ }).then(async (el) => {
  await waitFor(() => expect(el).toHaveAttribute('aria-busy', 'false'));
  return el;
});

beforeEach(() => {
  createCompareScene.mockReset();
  measureCpu.mockReset();
  measureCpu.mockReturnValue(10);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('an option, as a look for the studio’s box', () => {
  it('wears exactly the shopper’s box colour, wrap and card, and the theme’s tissue', () => {
    const look = studioLook(config({ box: '#1f4e5f', ribbon: '#8b1e3f', pattern: 'dots', card: 'kraft' }));
    expect(look.box.color).toBe(0x1f4e5f);
    expect(look.wrap).toEqual({ pattern: 'dots', box: '#1f4e5f' });
    expect(look.card).toBe('kraft');
    expect(look.tissue).toBe(hexToInt(THEMES.midnight.tissue));
    expect(JSON.stringify(look)).not.toMatch(/price|budget/i);
  });

  it('keeps the ribbon the colour they chose: only a little deeper, for satin that catches more light than a swatch', () => {
    const { color } = studioLook(config({ ribbon: '#d4af37' })).ribbon;
    const [r, g, b] = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
    expect([r / 0xd4, g / 0xaf, b / 0x37].every((k) => k > 0.7 && k < 0.8)).toBe(true);
  });

  it('prints only the printed wraps: satin and plain are the box’s own finish', () => {
    expect(studioLook(config({ pattern: 'satin' })).wrap).toBeNull();
    expect(studioLook(config({ pattern: 'plain' })).wrap).toBeNull();
    for (const pattern of ['stripes', 'dots', 'confetti', 'botanical', 'kraft', 'polaroid']) expect(studioLook(config({ pattern })).wrap?.pattern).toBe(pattern);
  });

  it('has a finish, a tile and a card for every wrap and card style a shopper can pick', () => {
    expect(Object.keys(FINISHES).sort()).toEqual(Object.keys(PATTERNS).sort());
    expect(Object.keys(WRAP_TILE).sort()).toEqual(Object.keys(PATTERNS).sort());
    expect(Object.keys(CARD_PAPERS).sort()).toEqual(Object.keys(CARD_STYLES).sort());
  });

  it('stamps the wordmark so it reads: deep on a light box, champagne foil on a dark one', () => {
    expect(luminance('#f3efe7')).toBeGreaterThan(0.35);
    expect(studioLook(config({ box: '#f3efe7' })).foil).toBeLessThan(0x606060);
    expect(studioLook(config({ box: '#17181d' })).foil).toBe(0xe0c692);
  });

  it.each(THEME_KEYS)('%s: the same bow, band, room and movement as every other option and as the reveal', (key) => {
    const look = studioLook(withTheme(config(), key));
    const other = studioLook(config());
    expect(look.bow).toBe(other.bow);
    expect(look.band).toEqual(other.band);
    expect(look.set).toBe(DARK_SET);
    expect(look.set).toBe(LOOKS.royal.set);
    expect(look.lid).toBe(other.lid);
    expect(look.poses).toBe(LOOKS.royal.poses);
  });
});

describe('sharing the stage', () => {
  it('stands the options side by side on a wide stage, and one above the other on a phone', () => {
    const wide = splitRects(800, 420);
    expect(wide).toEqual([{ x: 0, y: 0, w: 400, h: 420 }, { x: 400, y: 0, w: 400, h: 420 }]);
    const phone = splitRects(330, 495);
    expect(phone).toEqual([{ x: 0, y: 0, w: 330, h: 247 }, { x: 0, y: 247, w: 330, h: 248 }]);
    expect(800 / 420).toBeGreaterThan(SIDE_BY_SIDE_FROM);
    expect(330 / 495).toBeLessThan(SIDE_BY_SIDE_FROM);
  });

  it.each([[801, 420], [333, 497]])('covers the whole stage exactly, with no overlap, at %ix%i', (width, height) => {
    const [a, b] = splitRects(width, height);
    expect(a.w * a.h + b.w * b.h).toBe(width * height);
    expect(b.x === a.w || b.y === a.h).toBe(true);
  });
});

describe('opening the boxes', () => {
  const look = studioLook(config());

  it('runs from the closed box to the finished reveal', () => {
    expect(openStateAt(look, 0)).toEqual(stateAt(look, null));
    expect(openStateAt(look, 1)).toEqual(stateAt(look, 'finished'));
    expect(OPEN_STAGES.map(([stage]) => stage)).toEqual(['ribbon', 'lid', 'reveal']);
  });

  it('takes the ribbon off before the lid moves, and the gifts rise only once it is open', () => {
    const untied = openStateAt(look, OPEN_STAGES[0][2]);
    expect(untied.bands).toBe(1);
    expect(untied.lidDeg).toBe(0);
    expect(openStateAt(look, 0.5).lidDeg).toBeGreaterThan(0);
    expect(openStateAt(look, 0.5).print).toBe(0);
    expect(openStateAt(look, OPEN_STAGES[2][1]).lidDeg).toBeGreaterThanOrEqual(LID_OPEN_DEG);
  });

  it('swings the lid steadily one way, so closing is the same movement backwards', () => {
    const angles = Array.from({ length: 41 }, (_, i) => openStateAt(look, 0.3 + (i / 40) * 0.25).lidDeg);
    angles.slice(1).forEach((angle, i) => expect(angle).toBeGreaterThanOrEqual(angles[i]));
  });
});

describe('what a device is asked to draw', () => {
  it('lets a view ask for a tighter frame budget, and keeps the reveal’s own', () => {
    expect(verdict('high', 29)).toBe('keep');
    expect(verdict('high', 29, 24)).toBe('step-down');
    expect(verdict('medium', 21, 24)).toBe('keep');
    expect(verdict('high', PROBE_BUDGET_MS + 1)).toBe('step-down');
  });
});

describe('the comparison stage', () => {
  it('gives the scene both options: their own looks and gifts, and never a price', async () => {
    withWebGL();
    render(stage());
    await ready();
    const { options } = createCompareScene.mock.calls[0][1];
    expect(options).toHaveLength(2);
    expect(options[0].look.box.color).toBe(0x17181d);
    expect(options[1].look.box.color).toBe(0xf3efe7);
    expect(options[0].gift).toEqual({ items: [{ id: 4, name: 'Signature Perfume', image: perfume.image }], heading: 'For Aditi', message: 'With love', photos: [] });
    expect(JSON.stringify(options)).not.toMatch(/price|budget/i);
    expect(JSON.stringify(options.map((o) => o.gift))).not.toMatch(/1199|1500/);
  });

  it('keeps its controls disabled, and says so, until the studio is ready', async () => {
    let finish;
    createCompareScene.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind) => (kind === 'webgl2' ? {} : null));
    vi.stubGlobal('ResizeObserver', Observer);
    vi.stubGlobal('IntersectionObserver', Observer);
    render(stage());
    expect(screen.getByRole('status')).toHaveTextContent('Preparing the studio…');
    expect(screen.getByRole('group', { name: 'Comparison controls' })).toBeDisabled();
    expect(screen.getByRole('group', { name: /^Option A/ })).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => expect(createCompareScene).toHaveBeenCalled());
    await act(async () => finish(fakeScene()));
    await waitFor(() => expect(screen.getByRole('group', { name: 'Comparison controls' })).not.toBeDisabled());
    expect(screen.queryByText('Preparing the studio…')).not.toBeInTheDocument();
  });

  it('opens and closes both boxes together, turns them together, and goes back to the front view', async () => {
    const scene = withWebGL();
    const user = userEvent.setup();
    render(stage());
    await ready();
    await waitFor(() => expect(scene.setOpen).toHaveBeenLastCalledWith(false));
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(scene.setOpen).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Closed' }));
    expect(scene.setOpen).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole('button', { name: 'Turn slowly' }));
    expect(scene.setSpin).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Front view' }));
    expect(scene.front).toHaveBeenCalled();
    expect(scene.setSpin).toHaveBeenLastCalledWith(false);
    const stageEl = screen.getByRole('group', { name: /^Option A/ });
    stageEl.focus();
    await user.keyboard('{ArrowRight}');
    expect(scene.turnBy).toHaveBeenCalledWith(15, 0);
  });

  it('changes only the option that changed', async () => {
    const scene = withWebGL();
    const options = optionsFor();
    const { rerender } = render(stage({ options }));
    await ready();
    await waitFor(() => expect(scene.setOption).toHaveBeenCalledTimes(2));
    scene.setOption.mockClear();
    rerender(stage({ options: [options[0], { ...options[1], config: withTheme(config(), 'nature'), caption: 'Nature Inspired' }] }));
    await waitFor(() => expect(scene.setOption).toHaveBeenCalled());
    expect(scene.setOption.mock.calls.every(([index]) => index === 1)).toBe(true);
    expect(scene.setOption.mock.calls.at(-1)[1].look.box.color).toBe(hexToInt(THEMES.nature.box));
  });

  it('draws a still of every theme with the same scene, for the theme tiles', async () => {
    const scene = withWebGL(fakeScene({ stills: vi.fn(() => Promise.resolve(THEME_KEYS.map((k) => `data:image/jpeg;base64,${k}`))) }));
    const onStills = vi.fn();
    render(stage({ onStills }));
    await ready();
    await waitFor(() => expect(onStills).toHaveBeenCalledWith(Object.fromEntries(THEME_KEYS.map((k) => [k, `data:image/jpeg;base64,${k}`]))));
    expect(scene.stills.mock.calls[0][0].map((look) => look.box.color)).toEqual(THEME_KEYS.map((k) => hexToInt(THEMES[k].box)));
  });

  it('lays a photo its host won’t share with WebGL over its print, in that option’s half', async () => {
    withWebGL();
    // A stage measured at 800 by 420: the options stand side by side.
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { this.callback = callback; }

      observe() { this.callback([{ contentRect: { width: 800, height: 420 } }]); }

      disconnect() {}
    });
    render(stage());
    await ready();
    const { onPhotoOverlays, onOverlayFrame } = createCompareScene.mock.calls[0][1];
    act(() => onPhotoOverlays(1, [{ id: '1-0', url: 'https://img.example/refused.jpg', aspect: 1 }]));
    const halves = document.querySelectorAll('.cmp-photos');
    expect(halves).toHaveLength(2);
    expect(halves[0].querySelector('img')).toBeNull();
    const photo = halves[1].querySelector('img.s3d-photo');
    expect(photo).toHaveAttribute('src', 'https://img.example/refused.jpg');
    expect(halves[1]).toHaveStyle({ left: '400px', width: '400px' });
    act(() => onOverlayFrame('1-0', Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0)), 1));
    expect(photo.style.opacity).toBe('1');
    expect(photo.style.transform).toMatch(/^matrix3d\(1\.000000,0\.000000/);
  });

  it('names a gift whose photo couldn’t be loaded, once the boxes are open', async () => {
    withWebGL();
    const user = userEvent.setup();
    render(stage());
    await ready();
    const { onPhotos } = createCompareScene.mock.calls[0][1];
    act(() => onPhotos(1, ['Signature Perfume']));
    expect(screen.queryByText(/couldn’t be loaded/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText(/Signature Perfume \(option B\): this photo couldn’t be loaded/)).toBeInTheDocument();
  });

  it('offers no turning where the device asks for reduced motion', async () => {
    const restore = reducedMotion();
    withWebGL();
    render(stage());
    await ready();
    expect(screen.queryByRole('button', { name: 'Turn slowly' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Front view' })).toBeInTheDocument();
    restore();
  });
});

describe('the CSS fallback stays', () => {
  it('without WebGL: the CSS boxes, no 3D code, and the open and closed views still work', async () => {
    withoutWebGL();
    const onStills = vi.fn();
    const user = userEvent.setup();
    const { container } = render(stage({ onStills }));
    expect(createCompareScene).not.toHaveBeenCalled();
    expect(onStills).toHaveBeenCalledWith(null);
    expect(container.querySelectorAll('.cmp-css-stage .gb3d')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Turn slowly' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(container.querySelectorAll('.cmp-css-stage .gb3d--open')).toHaveLength(2);
  });

  it('a device too slow for two boxes gets the CSS boxes, open if they were open', async () => {
    withWebGL();
    const user = userEvent.setup();
    const { container } = render(stage());
    await ready();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    act(() => createCompareScene.mock.calls[0][1].onTooSlow());
    await waitFor(() => expect(container.querySelectorAll('.cmp-css-stage .gb3d--open')).toHaveLength(2));
  });

  it('a scene that arrives after the time limit is thrown away, even if the timer never got its turn', async () => {
    const scene = fakeScene();
    withWebGL(scene);
    // The scene is built inside one long task: when it's handed back, the clock has moved on past the limit.
    const real = performance.now.bind(performance);
    createCompareScene.mockImplementation(() => {
      vi.spyOn(performance, 'now').mockImplementation(() => real() + INIT_LIMIT_MS + 1);
      return Promise.resolve(scene);
    });
    const { container } = render(stage());
    await waitFor(() => expect(container.querySelector('.cmp-css-stage')).toBeInTheDocument());
    expect(scene.dispose).toHaveBeenCalled();
  });

  it('a scene that reports itself too slow on arrival is thrown away', async () => {
    const scene = withWebGL(fakeScene({ tooSlow: true }));
    const { container } = render(stage());
    await waitFor(() => expect(container.querySelector('.cmp-css-stage')).toBeInTheDocument());
    expect(scene.dispose).toHaveBeenCalled();
  });
});

describe('the Compare tab', () => {
  const lab = (props = {}) => (
    <CompareLab config={config()} products={[perfume]} catalog={[hamper, perfume]} photos={[]} suggestions={[]} onApply={() => {}} {...props} />
  );

  it('marks the rows where the options differ, and only those', () => {
    const a = { config: config(), products: [perfume], total: 1199 };
    const b = { config: withTheme(config(), 'minimal'), products: [perfume], total: 1199 };
    const rows = compareRows(a, b, 1500);
    expect(rows.map((r) => [r.label, r.differs])).toEqual([['Gifts', false], ['Total', false], ['Budget', false], ['Packaging', true], ['Card', true]]);
    expect(compareRows(a, a, null).some((r) => r.differs || r.label === 'Budget')).toBe(false);
  });

  it('shows a theme as option B from its tile, or uses it straight away', async () => {
    withoutWebGL();
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(lab({ onApply }));
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: /Option B/ })).toHaveTextContent('Minimal Elegance');
    await user.click(screen.getByRole('button', { name: 'Show Nature Inspired as option B' }));
    expect(screen.getByRole('button', { name: 'Show Nature Inspired as option B' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(table).getByRole('row', { name: /Packaging/ })).toHaveTextContent('Nature Inspired: Kraft box, leaf ribbon, botanical wrap');
    expect(within(table).getByRole('row', { name: /Card/ })).toHaveTextContent('Recycled kraft');
    await user.click(screen.getByRole('button', { name: 'Use Birthday Celebration' }));
    expect(onApply).toHaveBeenLastCalledWith(themeLook('celebration'));
    await user.click(screen.getByRole('button', { name: 'Use option B' }));
    expect(onApply).toHaveBeenLastCalledWith(themeLook('nature'), null);
  });

  it('says when option B is the same as option A, rather than offering to switch to it', async () => {
    withoutWebGL();
    const user = userEvent.setup();
    render(lab());
    await user.click(screen.getByRole('button', { name: 'Show Midnight Luxury as option B' }));
    expect(screen.getByText(/Option B is the same as option A/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use option B' })).toBeDisabled();
    expect(screen.getByRole('table').querySelectorAll('tr.is-different')).toHaveLength(0);
  });

  it('shows the studio’s stills on the theme tiles once drawn, and the CSS boxes where there’s no 3D', async () => {
    withWebGL(fakeScene({ stills: vi.fn(() => Promise.resolve(THEME_KEYS.map((k) => `data:image/jpeg;base64,${k}`))) }));
    const { container, unmount } = render(lab());
    expect(container.querySelectorAll('.cmp-themes .cmp-thumb-wait')).toHaveLength(5);
    await waitFor(() => expect(container.querySelectorAll('.cmp-themes img.exp-thumb')).toHaveLength(5));
    expect(screen.getByRole('img', { name: /^Birthday Celebration: Coral box/ })).toHaveAttribute('src', 'data:image/jpeg;base64,celebration');
    unmount();
    vi.restoreAllMocks();
    withoutWebGL();
    const css = render(lab());
    expect(css.container.querySelectorAll('.cmp-themes .gb3d')).toHaveLength(5);
  });
});
