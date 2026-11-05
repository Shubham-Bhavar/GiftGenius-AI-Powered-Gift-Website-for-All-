import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { renderApp } from './renderApp.jsx';
import { INIT_LIMIT_MS, StudioStage3D } from '../components/studio/scene/StudioStage3D.jsx';
import { createStudioScene } from '../components/studio/scene/studioScene.js';
import { EXPERIENCES } from '../components/studio/experiences/experiences.js';
import { STAGES } from '../components/studio/experiences/useGiftAnimation.js';
import { readShare, sanitizeConfig, shareFragment, SHARED_EXPERIENCES, themeLook } from '../components/studio/look.js';
import { revealSteps } from '../components/studio/RevealPlayer.jsx';
import { applyMatrix, matrixForQuad, overlayOpacity } from '../components/studio/scene/photoOverlay.js';
import { loadPhoto, secureUrl } from '../components/studio/scene/studioMaterials.js';
import { LOOKS, LOOK_KEYS, posterFor, thumbFor } from '../components/studio/scene/looks.js';
import {
  approach, cameraDistance, LID_CURVES, LID_OPEN_DEG, MIN_TILT, STAGE_ORDER, stateAt,
} from '../components/studio/scene/choreography.js';
import {
  CPU_LIMIT_MS, GIVE_UP_MS, measureCpu, pixelRatioFor, probeDevice, PROBE_BUDGET_MS, QUALITY, qualityBelow, startingQuality, verdict,
} from '../components/studio/scene/quality.js';

vi.mock('../components/studio/scene/studioScene.js', () => ({ createStudioScene: vi.fn(), printLayout: vi.fn(), MAX_PRINTS: 6 }));
// The CPU check times the machine running it, so tests choose its answer: a busy test runner mustn't change the result.
vi.mock('../components/studio/scene/quality.js', async (importOriginal) => ({ ...await importOriginal(), measureCpu: vi.fn() }));

const product = { id: 4, name: 'Signature Perfume', image: 'https://img.example/perfume.jpg', price: 1199 };
const config = (over = {}) => sanitizeConfig({ products: [4], name: 'Aditi', message: 'With love', budget: 1500, ...over });
const fakeScene = (over = {}) => ({
  setLook: vi.fn(), setGift: vi.fn(() => Promise.resolve({ refused: [] })), play: vi.fn(), setPaused: vi.fn(), showIdle: vi.fn(), showFinished: vi.fn(),
  setSpin: vi.fn(), setDragging: vi.fn(), turnBy: vi.fn(), turnTo: vi.fn(), setVisible: vi.fn(), resize: vi.fn(), dispose: vi.fn(), info: vi.fn(() => ({})),
  tooSlow: false, ...over,
});

class Observer {
  observe() {}

  disconnect() {}
}

function withWebGL(scene = fakeScene()) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind) => (kind === 'webgl2' ? {} : null));
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  createStudioScene.mockResolvedValue(scene);
  return scene;
}
const withoutWebGL = () => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

function reducedMotion() {
  const original = window.matchMedia;
  window.matchMedia = (q) => ({ matches: String(q).includes('reduced-motion'), addEventListener() {}, removeEventListener() {} });
  return () => { window.matchMedia = original; };
}

const stage = (props = {}) => (
  <StudioStage3D experience={EXPERIENCES.royal} config={config()} items={[product]} photos={[]} {...props} />
);
const ready = () => waitFor(() => expect(createStudioScene).toHaveBeenCalled()).then(() => screen.findByRole('group', { name: /^Royal Luxury Reveal|^Birthday Surprise/ }));
const isCssPlayer = (container) => Boolean(container.querySelector('.xp-stage'));

beforeEach(() => {
  createStudioScene.mockReset();
  measureCpu.mockReset();
  measureCpu.mockReturnValue(10);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the reveal, as numbers', () => {
  it.each(LOOK_KEYS)('%s: every stage has a duration and a camera, and the ribbon comes off before the lid opens', (key) => {
    const look = LOOKS[key];
    STAGE_ORDER.forEach((name) => {
      expect(look.durations[name]).toBeGreaterThan(0);
      expect(look.poses[name]).toBeDefined();
    });
    expect(stateAt(look, 'lid', 0)).toMatchObject({ bowLoops: 1, bowKnot: 1, bands: 1, lidDeg: 0 });
  });

  it('uses the same stages as the state machine the controls drive', () => {
    expect(STAGE_ORDER).toEqual(STAGES);
  });

  it.each(LOOK_KEYS)('%s: at rest the bow is tied, the lid shut and nothing has risen', (key) => {
    expect(stateAt(LOOKS[key], null)).toMatchObject({ boxY: 0, bowLoops: 0, bowTails: 0, bowKnot: 0, bands: 0, lidDeg: 0, tissue: 0, print: 0, hero: 0, exposure: 1 });
  });

  it.each(LOOK_KEYS)('%s: finished, the ribbon is gone, the lid open and the gift standing', (key) => {
    const s = stateAt(LOOKS[key], 'finished');
    expect(s).toMatchObject({ bowLoops: 1, bowTails: 1, bowKnot: 1, bands: 1, print: 1, boxY: 0, hero: 0 });
    expect(s.lidDeg).toBeGreaterThan(LID_OPEN_DEG - 3);
  });

  it.each(LOOK_KEYS)('%s: skipping lands exactly where playing to the end does', (key) => {
    const look = LOOKS[key];
    const played = stateAt(look, 'reveal', 1);
    const skipped = stateAt(look, 'finished');
    ['bowLoops', 'bands', 'print', 'tissue', 'hero', 'boxY'].forEach((k) => expect(played[k]).toBeCloseTo(skipped[k], 5));
    expect(played.lidDeg).toBeCloseTo(skipped.lidDeg, 0);
    expect(played.camera).toEqual(skipped.camera);
  });

  it.each(LOOK_KEYS)('%s: no stage ever jumps: at 60 fps every value changes only a little from frame to frame', (key) => {
    const look = LOOKS[key];
    STAGE_ORDER.forEach((name) => {
      const frames = Math.round(look.durations[name] / 16.7);
      let last = stateAt(look, name, 0);
      for (let i = 1; i <= frames; i += 1) {
        const s = stateAt(look, name, i / frames);
        expect(Math.abs(s.lidDeg - last.lidDeg)).toBeLessThan(name === 'lid' && look.lid === 'pop' ? 12 : 5.5);
        expect(Math.abs(s.boxY - last.boxY)).toBeLessThan(0.16);
        expect(Math.abs(s.camera.yaw - last.camera.yaw)).toBeLessThan(1.4);
        expect(Math.abs(s.bands - last.bands)).toBeLessThan(0.08);
        expect(Math.abs(s.print - last.print)).toBeLessThan(0.08);
        last = s;
      }
    });
  });

  it.each(LOOK_KEYS)('%s: stages join up: each ends exactly where the next begins', (key) => {
    const look = LOOKS[key];
    STAGE_ORDER.slice(0, -1).forEach((name, i) => {
      const end = stateAt(look, name, 1);
      const start = stateAt(look, STAGE_ORDER[i + 1], 0);
      ['boxY', 'bowLoops', 'bowTails', 'bowKnot', 'bands'].forEach((k) => expect(start[k]).toBeCloseTo(end[k], 2));
      expect(start.camera.yaw).toBeCloseTo(end.camera.yaw, 5);
      expect(start.camera.tilt).toBeCloseTo(end.camera.tilt, 5);
      expect(start.camera.dolly).toBeCloseTo(end.camera.dolly, 5);
    });
  });

  it('Birthday drops in and bounces; Minimal and Sentimental are simply there', () => {
    const heights = Array.from({ length: 101 }, (_, i) => stateAt(LOOKS.birthday, 'entrance', i / 100).boxY);
    let bounces = 0;
    for (let i = 2; i < heights.length; i += 1) if (heights[i - 1] > heights[i - 2] && heights[i - 1] > heights[i]) bounces += 1;
    expect(bounces).toBeGreaterThanOrEqual(2);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(0);
    expect(stateAt(LOOKS.minimal, 'entrance', 0.5).boxY).toBe(0);
    expect(stateAt(LOOKS.sentimental, 'entrance', 0.5).boxY).toBe(0);
  });

  it('each lid has its own ending: a settle, a springy pop, a slow arrival and none at all', () => {
    const peak = (curve) => Math.max(...Array.from({ length: 201 }, (_, i) => curve(i / 200)));
    expect(peak(LID_CURVES.weighted)).toBeGreaterThan(LID_OPEN_DEG);
    expect(peak(LID_CURVES.pop)).toBeGreaterThan(peak(LID_CURVES.weighted));
    expect(peak(LID_CURVES.soft)).toBeLessThanOrEqual(LID_OPEN_DEG);
    expect(LID_CURVES.slow(1)).toBeCloseTo(LID_OPEN_DEG, 5);
    Object.values(LID_CURVES).forEach((curve) => expect(curve(0)).toBe(0));
  });

  it('Sentimental brings the message forward and dims the set, then returns it before the gift rises', () => {
    const { sentimental } = LOOKS;
    const during = stateAt(sentimental, 'reveal', 0.3);
    expect(during.hero).toBe(1);
    expect(during.exposure).toBeLessThan(0.5);
    expect(during.print).toBe(0);
    const after = stateAt(sentimental, 'reveal', 0.9);
    expect(after.hero).toBe(0);
    expect(after.exposure).toBe(1);
    expect(after.print).toBeGreaterThan(0);
  });

  it('no look sends the camera low enough for the lacquer to wash out', () => {
    LOOK_KEYS.forEach((key) => Object.values(LOOKS[key].poses).forEach((p) => expect(p.tilt).toBeGreaterThanOrEqual(MIN_TILT)));
  });

  it('eases at the same rate whatever the frame rate, and keeps the box in frame on a narrow screen', () => {
    const fast = approach(approach(0, 1, 1 / 120, 6), 1, 1 / 120, 6);
    expect(fast).toBeCloseTo(approach(0, 1, 1 / 60, 6), 5);
    expect(cameraDistance(0.5, 24, 2.4, 1.3)).toBeGreaterThan(cameraDistance(1.33, 24, 2.4, 1.3));
  });
});

describe('one studio, five looks', () => {
  it('Birthday is a coral, not a plain red or a peach', () => {
    const { color } = LOOKS.birthday.box;
    const [r, g, b] = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b - 12);
    expect(g / r).toBeGreaterThan(0.4); // below this it reads as red
    expect(g / r).toBeLessThan(0.55); // above this it reads as orange or peach
    expect(r).toBeLessThan(200); // and no lighter than this, or the lacquer looks pale and cheap
  });

  it('has a look for exactly the five experiences', () => {
    expect(LOOK_KEYS.sort()).toEqual(Object.keys(EXPERIENCES).sort());
  });

  it.each(LOOK_KEYS)('%s: has a real poster and thumbnail', (key) => {
    [posterFor(key), thumbFor(key)].forEach((url) => {
      expect(statSync(join('public', url)).size).toBeGreaterThan(1000);
    });
  });

  it('every look sets the same material values, so none can drift into a different kind of box', () => {
    const shape = (o) => Object.keys(o).sort().join();
    const required = ['box', 'lining', 'ribbon', 'foil', 'tissue', 'set', 'band', 'bow', 'arrival', 'lid', 'durations', 'poses', 'reveal'];
    LOOK_KEYS.forEach((key) => {
      required.forEach((field) => expect(LOOKS[key][field]).toBeDefined());
      expect(shape(LOOKS[key].lining)).toBe('color,sheen');
      expect(shape(LOOKS[key].ribbon)).toBe('color,metalness,roughness,sheen');
    });
  });

  it('only the Memory look uses the shopper\'s photo on the box', () => {
    expect(LOOK_KEYS.filter((key) => LOOKS[key].photoPrints)).toEqual(['memory']);
  });

  it('confetti is one fixed burst, on Birthday only; Minimal has no particles at all', () => {
    expect(LOOKS.birthday.effect.type).toBe('confetti');
    expect(LOOKS.birthday.effect.count).toBeLessThanOrEqual(120);
    expect(LOOKS.minimal.effect).toBeUndefined();
    LOOK_KEYS.filter((key) => key !== 'birthday').forEach((key) => expect(LOOKS[key].effect?.type).not.toBe('confetti'));
  });
});

describe('what a device is asked to do', () => {
  /** A fake GL context reporting this renderer. `caveat` means the browser refuses a context that needs real hardware. */
  function fakeGPU(renderer, { caveat = false } = {}) {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind, options) => {
      if (kind !== 'webgl2' || (caveat && options?.failIfMajorPerformanceCaveat)) return null;
      return {
        getExtension: (name) => (name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 1 } : null),
        getParameter: () => renderer,
      };
    });
  }

  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'Mesa softpipe',
    'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)',
  ])('recognises software rendering: %s', (renderer) => {
    fakeGPU(renderer);
    expect(probeDevice()).toMatchObject({ webgl: true, software: true });
  });

  it('takes the browser\'s word when it says a GPU would be a major compromise', () => {
    fakeGPU('Some Unknown Renderer', { caveat: true });
    expect(probeDevice().software).toBe(true);
  });

  it('does not mistake a real GPU for software', () => {
    fakeGPU('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)');
    expect(probeDevice()).toMatchObject({ webgl: true, software: false });
  });

  it('never starts real-time 3D on software rendering, without WebGL, with data saving on, or on a slow CPU', () => {
    const gpu = { webgl: true, software: false };
    expect(startingQuality({ webgl: false, software: false }, { cores: 16 })).toBeNull();
    expect(startingQuality({ webgl: true, software: true }, { cores: 16 })).toBeNull();
    expect(startingQuality(gpu, { cores: 16, saveData: true })).toBeNull();
    expect(startingQuality(gpu, { cores: 8, cpuMs: CPU_LIMIT_MS + 1 })).toBeNull();
    expect(startingQuality(gpu, { cores: 8, cpuMs: CPU_LIMIT_MS - 1 })).toBe('high');
  });

  it('the CPU check itself gives a real, positive time', async () => {
    const { measureCpu: real } = await vi.importActual('../components/studio/scene/quality.js');
    expect(real()).toBeGreaterThan(0);
  });

  it('starts weaker devices lower', () => {
    const gpu = { webgl: true, software: false };
    expect(startingQuality(gpu, { cores: 8, memory: 8 })).toBe('high');
    expect(startingQuality(gpu, { cores: 8, memory: 8, coarse: true })).toBe('medium');
    expect(startingQuality(gpu, { cores: 4 })).toBe('medium');
    expect(startingQuality(gpu, { cores: 2 })).toBe('low');
    expect(startingQuality(gpu, { cores: 8, memory: 2 })).toBe('low');
  });

  it('steps down in order: sharpness first, and light and shadow last', () => {
    expect(qualityBelow('high')).toBe('medium');
    expect(qualityBelow('medium')).toBe('reduced');
    expect(qualityBelow('reduced')).toBe('low');
    expect(qualityBelow('low')).toBeNull();
    expect(QUALITY.medium.reflection).toBeLessThan(QUALITY.high.reflection);
    expect(QUALITY.reduced.pixelRatio).toBeLessThan(QUALITY.medium.pixelRatio);
    expect(QUALITY.reduced.shadow).toBe(QUALITY.medium.shadow);
    expect(QUALITY.low.reflection).toBe(0);
    expect(QUALITY.low.shadow).toBe('contact');
  });

  it('judges frames: keep, step down, or give up', () => {
    expect(verdict('high', PROBE_BUDGET_MS - 1)).toBe('keep');
    expect(verdict('high', PROBE_BUDGET_MS + 1)).toBe('step-down');
    expect(verdict('reduced', PROBE_BUDGET_MS + 1)).toBe('step-down');
    expect(verdict('low', PROBE_BUDGET_MS + 1)).toBe('keep');
    expect(verdict('low', GIVE_UP_MS + 1)).toBe('give-up');
  });

  it('keeps a small canvas sharper, because softness shows most there', () => {
    expect(pixelRatioFor(QUALITY.low, 3, 360)).toBe(1.5);
    expect(pixelRatioFor(QUALITY.low, 3, 1000)).toBe(1);
    expect(pixelRatioFor(QUALITY.high, 1, 1000)).toBe(1);
    expect(pixelRatioFor(QUALITY.high, 3, 1000)).toBe(2);
  });
});

describe('the CSS player stays as the fallback', () => {
  it('without WebGL: the CSS player, with the same gift, and no 3D code', () => {
    withoutWebGL();
    const { container } = render(stage());
    expect(isCssPlayer(container)).toBe(true);
    expect(createStudioScene).not.toHaveBeenCalled();
  });

  it('on software rendering: the CSS player, and no 3D code', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind, options) => (
      kind === 'webgl2' && !options?.failIfMajorPerformanceCaveat ? {} : null
    ));
    const { container } = render(stage());
    expect(isCssPlayer(container)).toBe(true);
    expect(createStudioScene).not.toHaveBeenCalled();
  });

  it('on a slow CPU: the CSS player, and no 3D code', () => {
    withWebGL();
    measureCpu.mockReturnValue(CPU_LIMIT_MS + 50);
    const { container } = render(stage());
    expect(isCssPlayer(container)).toBe(true);
    expect(createStudioScene).not.toHaveBeenCalled();
  });

  it('with data saving on: the CSS player, and no 3D code', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind) => (kind === 'webgl2' ? {} : null));
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } });
    const { container } = render(stage());
    expect(isCssPlayer(container)).toBe(true);
    expect(createStudioScene).not.toHaveBeenCalled();
  });

  it('a device already ruled out is not timed at all', () => {
    withoutWebGL();
    render(stage());
    expect(measureCpu).not.toHaveBeenCalled();
  });

  it('if the scene fails to start: the CSS player', async () => {
    withWebGL();
    createStudioScene.mockRejectedValue(new Error('no context'));
    const { container } = render(stage());
    await waitFor(() => expect(isCssPlayer(container)).toBe(true));
  });

  it('if the device proves too slow once measured: the scene is freed, and the CSS player', async () => {
    const scene = withWebGL(fakeScene({ tooSlow: true }));
    const { container } = render(stage());
    await waitFor(() => expect(isCssPlayer(container)).toBe(true));
    expect(scene.dispose).toHaveBeenCalled();
  });

  it('if the browser takes the GPU away, or it becomes too slow while running: the CSS player', async () => {
    withWebGL();
    const first = render(stage());
    await ready();
    act(() => createStudioScene.mock.calls[0][1].onContextLost());
    await waitFor(() => expect(isCssPlayer(first.container)).toBe(true));
    first.unmount();

    createStudioScene.mockClear();
    const second = render(stage());
    await ready();
    act(() => createStudioScene.mock.calls[0][1].onTooSlow());
    await waitFor(() => expect(isCssPlayer(second.container)).toBe(true));
  });
});

describe('the 3D stage', () => {
  it('gives the scene only what the shopper gave: real products, their words, no price or budget', async () => {
    withWebGL();
    render(stage());
    await ready();
    const { gift, lookKey } = createStudioScene.mock.calls[0][1];
    expect(lookKey).toBe('royal');
    expect(gift).toEqual({ items: [{ id: 4, name: 'Signature Perfume', image: product.image }], heading: 'For Aditi', message: 'With love', photos: [] });
    expect(JSON.stringify(gift)).not.toMatch(/price|budget|1199|1500/i);
  });

  it('adds no words of its own, except the birthday greeting the shopper chose by picking that experience', async () => {
    withWebGL();
    render(stage({ config: config({ name: '', message: '' }) }));
    await ready();
    expect(createStudioScene.mock.calls[0][1].gift).toMatchObject({ heading: '', message: '' });

    createStudioScene.mockClear();
    render(stage({ experience: EXPERIENCES.birthday, config: config({ name: 'Aditi' }) }));
    await waitFor(() => expect(createStudioScene).toHaveBeenCalled());
    expect(createStudioScene.mock.calls[0][1].gift.heading).toBe('Happy birthday, Aditi');
  });

  it('keeps working if the device’s motion setting changes during the visit: same scene, and the gift still updates', async () => {
    const scene = withWebGL();
    const { rerender } = render(stage());
    await ready();
    await waitFor(() => expect(scene.showIdle).toHaveBeenCalled());
    const restore = reducedMotion();
    rerender(stage({ config: config({ message: 'Changed my mind' }) }));
    restore();
    expect(scene.dispose).not.toHaveBeenCalled();
    expect(createStudioScene).toHaveBeenCalledTimes(1);
    expect(scene.setGift).toHaveBeenCalledWith(expect.objectContaining({ message: 'Changed my mind' }));
  });

  it('plays stage by stage, following the same state machine as the controls', async () => {
    const scene = withWebGL();
    const user = userEvent.setup();
    render(stage());
    await ready();
    await waitFor(() => expect(scene.showIdle).toHaveBeenCalled());
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    await waitFor(() => expect(scene.play).toHaveBeenCalledWith('entrance', LOOKS.royal.durations.entrance));
  });

  it('pauses and resumes without restarting the stage', async () => {
    const scene = withWebGL();
    const user = userEvent.setup();
    render(stage());
    await ready();
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    await waitFor(() => expect(scene.play).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(scene.setPaused).toHaveBeenLastCalledWith(true));
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(scene.setPaused).toHaveBeenLastCalledWith(false));
    expect(scene.play).toHaveBeenCalledTimes(1);
  });

  it('skipping shows the finished box, with no effect firing, and the card and gift in text', async () => {
    const scene = withWebGL();
    const user = userEvent.setup();
    const { container } = render(stage());
    await ready();
    await user.click(await screen.findByRole('button', { name: 'Skip reveal' }));
    await waitFor(() => expect(scene.showFinished).toHaveBeenCalled());
    const card = container.querySelector('.s3d-card');
    expect(within(card).getByText('For Aditi')).toBeInTheDocument();
    expect(within(card).getByText('With love')).toBeInTheDocument();
    expect(within(card).getByText('Signature Perfume')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('₹');
  });

  it('changes look on the same box, without rebuilding the scene', async () => {
    const scene = withWebGL();
    const { rerender } = render(stage());
    await ready();
    await waitFor(() => expect(scene.showIdle).toHaveBeenCalled());
    rerender(stage({ experience: EXPERIENCES.minimal }));
    await waitFor(() => expect(scene.setLook).toHaveBeenCalledWith('minimal'));
    expect(createStudioScene).toHaveBeenCalledTimes(1);
  });

  it('a preview plays straight away', async () => {
    const scene = withWebGL();
    render(stage({ autoPlay: true, run: 1 }));
    await waitFor(() => expect(createStudioScene).toHaveBeenCalled());
    await waitFor(() => expect(scene.play).toHaveBeenCalledWith('entrance', LOOKS.royal.durations.entrance));
  });

  it('the turntable and the reveal do not run together', async () => {
    const scene = withWebGL();
    const user = userEvent.setup();
    render(stage());
    await ready();
    await user.click(await screen.findByRole('button', { name: '360° Studio View' }));
    await waitFor(() => expect(scene.setSpin).toHaveBeenLastCalledWith(true));
    await user.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(scene.setSpin).toHaveBeenLastCalledWith(false));
  });

  it('turns by keyboard and by the dial', async () => {
    const scene = withWebGL();
    const user = userEvent.setup();
    render(stage());
    const group = await ready();
    group.focus();
    await user.keyboard('{ArrowRight}');
    expect(scene.turnBy).toHaveBeenLastCalledWith(15, 0);
  });

  it('with reduced motion: tells the scene, offers no motor, and turning by hand still works', async () => {
    const restore = reducedMotion();
    try {
      const scene = withWebGL();
      const user = userEvent.setup();
      render(stage());
      const group = await ready();
      expect(createStudioScene.mock.calls[0][1].reducedMotion).toBe(true);
      expect(screen.queryByRole('button', { name: '360° Studio View' })).not.toBeInTheDocument();
      group.focus();
      await user.keyboard('{ArrowLeft}');
      expect(scene.turnBy).toHaveBeenLastCalledWith(-15, 0);
    } finally {
      restore();
    }
  });

  it('says so when a photo cannot be loaded at all, and shows its name and link image rather than faking one', async () => {
    withWebGL();
    const user = userEvent.setup();
    const { container } = render(stage());
    await ready();
    // Photos arrive after the box is ready, so a slow host can't hold it up.
    act(() => createStudioScene.mock.calls[0][1].onPhotos(['Signature Perfume']));
    await user.click(await screen.findByRole('button', { name: 'Skip reveal' }));
    expect(await screen.findByText(/couldn’t be loaded for the box/)).toHaveTextContent('Signature Perfume');
    expect(container.querySelector('.s3d-card-gifts img')).toHaveAttribute('src', product.image);
  });

  it('asks for a photo on the Memory look, and shows nothing in its place', async () => {
    withWebGL();
    render(stage({ experience: EXPERIENCES.memory }));
    await waitFor(() => expect(createStudioScene).toHaveBeenCalled());
    expect(await screen.findByText(/made for your photo/)).toBeInTheDocument();
    expect(createStudioScene.mock.calls[0][1].gift.photos).toEqual([]);
  });

  it('frees the GPU when it goes away', async () => {
    const scene = withWebGL();
    const { unmount } = render(stage());
    await ready();
    await waitFor(() => expect(scene.showIdle).toHaveBeenCalled());
    unmount();
    expect(scene.dispose).toHaveBeenCalled();
  });
});

describe('every gift in the box', () => {
  const realLayout = async () => (await vi.importActual('../components/studio/scene/studioScene.js')).printLayout;
  const CARD_W = 0.86;

  it('shows as many gifts as any box or link can hold, so none is ever left out', async () => {
    const { MAX_PRINTS, printLayout } = await vi.importActual('../components/studio/scene/studioScene.js');
    const { MAX_BOX } = await vi.importActual('../components/studio/BoxComposer.jsx');
    expect(MAX_PRINTS).toBe(MAX_BOX);
    expect(sanitizeConfig({ products: [1, 2, 3, 4, 5, 6, 7, 8, 9] }).products).toHaveLength(MAX_PRINTS);
    expect(printLayout(MAX_PRINTS)).toHaveLength(MAX_PRINTS);
  });

  it('has a place for every gift the studio allows, in the order given', async () => {
    const printLayout = await realLayout();
    for (let n = 1; n <= 6; n += 1) expect(printLayout(n)).toHaveLength(n);
  });

  it('never overlaps two gifts in a row, and keeps them all inside the box', async () => {
    const printLayout = await realLayout();
    for (let n = 1; n <= 6; n += 1) {
      const rows = {};
      printLayout(n).forEach((place) => {
        const halfW = (CARD_W * place.scale) / 2;
        expect(Math.abs(place.x) + halfW).toBeLessThan(1.14);
        (rows[place.z ?? 'main'] ??= []).push([place.x - halfW, place.x + halfW]);
      });
      Object.values(rows).forEach((row) => row.sort((a, b) => a[0] - b[0]).slice(1).forEach((span, i) => {
        expect(span[0]).toBeGreaterThanOrEqual(row[i][1]);
      }));
    }
  });

  it('uses two rows, with the back one raised, for five and six gifts', async () => {
    const printLayout = await realLayout();
    [5, 6].forEach((n) => {
      const places = printLayout(n);
      const back = places.filter((place) => place.lift > 0);
      const front = places.filter((place) => !place.lift);
      expect(back.length + front.length).toBe(n);
      expect(back.length).toBe(3);
      back.forEach((b) => front.forEach((f) => expect(b.z).toBeLessThan(f.z)));
    });
    expect(printLayout(4).every((place) => !place.lift)).toBe(true);
  });

  it('the scene is given every gift, and the page names and counts them all', async () => {
    withWebGL();
    const six = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `Gift number ${i + 1}`, image: `https://img.example/${i + 1}.jpg`, price: 100 }));
    const user = userEvent.setup();
    const { container } = render(stage({ items: six, config: config({ products: six.map((g) => g.id) }) }));
    await ready();
    expect(createStudioScene.mock.calls[0][1].gift.items.map((g) => g.name)).toEqual(six.map((g) => g.name));
    await user.click(await screen.findByRole('button', { name: 'Skip reveal' }));
    expect(container.querySelector('.s3d-card-count')).toHaveTextContent('6 gifts in this box');
    expect(container.querySelectorAll('.s3d-card-gifts li')).toHaveLength(6);
    six.forEach((g) => expect(within(container.querySelector('.s3d-card-gifts')).getByText(g.name)).toBeInTheDocument());
    expect(screen.getByText(new RegExp(`Inside: ${six.map((g) => g.name).join(' · ')}`))).toBeInTheDocument();
  });

  it('a single gift has no count line', async () => {
    withWebGL();
    const user = userEvent.setup();
    const { container } = render(stage());
    await ready();
    await user.click(await screen.findByRole('button', { name: 'Skip reveal' }));
    expect(container.querySelector('.s3d-card-count')).toBeNull();
  });
});

describe('catalogue photos', () => {
  /** A fake browser image: `allowed` says what each kind of request gets. */
  function fakeImages(allowed) {
    const seen = [];
    class FakeImage {
      constructor() {
        this.naturalWidth = 800;
        this.naturalHeight = 400;
        this.width = 800;
        this.height = 400;
      }

      set src(url) {
        seen.push({ url, cors: this.crossOrigin === 'anonymous', referrer: this.referrerPolicy });
        queueMicrotask(() => (allowed({ url, cors: this.crossOrigin === 'anonymous' }) ? this.onload() : this.onerror()));
      }
    }
    vi.stubGlobal('Image', FakeImage);
    return seen;
  }

  it('asks for the same image over https, because an http redirect is what blocks it', () => {
    expect(secureUrl('http://froggmag.com/cdn/a.png?v=1')).toBe('https://froggmag.com/cdn/a.png?v=1');
    expect(secureUrl('HTTP://x.example/a.png')).toBe('https://x.example/a.png');
    expect(secureUrl('https://x.example/a.png')).toBe('https://x.example/a.png');
    expect(secureUrl('blob:http://localhost/1')).toBe('blob:http://localhost/1');
  });

  it('a host that allows WebGL over https is drawn in 3D', async () => {
    const seen = fakeImages(({ url, cors }) => cors && url.startsWith('https:'));
    const photo = await loadPhoto('http://host.example/a.png', 4);
    expect(photo.texture).toBeTruthy();
    expect(photo.aspect).toBe(2);
    expect(seen[0]).toMatchObject({ url: 'https://host.example/a.png', cors: true });
    expect(seen).toHaveLength(1);
  });

  it('a host that refuses WebGL is still shown, as the same real image from the same address', async () => {
    const seen = fakeImages(({ cors }) => !cors);
    const photo = await loadPhoto('https://host.example/a.webp', 4);
    expect(photo.texture).toBeNull();
    expect(photo.url).toBe('https://host.example/a.webp');
    expect(photo.aspect).toBe(2);
    expect(seen.map((s) => s.url)).toEqual(['https://host.example/a.webp', 'https://host.example/a.webp']);
  });

  it('a photo that cannot load at all gives nothing: no substitute, and no placeholder posing as the product', async () => {
    fakeImages(() => false);
    expect(await loadPhoto('https://host.example/gone.png', 4)).toBeNull();
    expect(await loadPhoto('', 4)).toBeNull();
    expect(await loadPhoto(undefined, 4)).toBeNull();
  });

  it('lays a plain photo exactly over its window, in true perspective', () => {
    const corners = [[100, 80], [300, 95], [290, 260], [110, 240]];
    const m = matrixForQuad(256, 128, corners);
    [[0, 0, 0], [256, 0, 1], [256, 128, 2], [0, 128, 3]].forEach(([x, y, i]) => {
      const [px, py] = applyMatrix(m, x, y);
      expect(px).toBeCloseTo(corners[i][0], 6);
      expect(py).toBeCloseTo(corners[i][1], 6);
    });
    expect(matrixForQuad(256, 128, [[0, 0], [0, 0], [0, 0], [0, 0]])).toBeNull();
  });

  it('only shows the laid-over photo when it can truly be there', () => {
    const clear = { rise: 1, facing: 0.95, clearance: 10 };
    expect(overlayOpacity(clear)).toBe(1);
    expect(overlayOpacity({ ...clear, rise: 0.3 })).toBe(0); // still lying flat, under the tissue
    expect(overlayOpacity({ ...clear, facing: 0.1 })).toBe(0); // turned away
    expect(overlayOpacity({ ...clear, facing: -0.9 })).toBe(0); // seen from behind
    expect(overlayOpacity({ ...clear, clearance: -2 })).toBe(0); // the box's wall would be in front of it
    expect(overlayOpacity({ ...clear, hero: 1 })).toBe(0); // the message has the stage
  });

  it('the page lays the real image over the print, loaded as a normal image', async () => {
    withWebGL();
    const { container } = render(stage());
    await ready();
    const options = createStudioScene.mock.calls[0][1];
    act(() => options.onPhotoOverlays([{ id: 0, url: 'https://host.example/real.webp', aspect: 1.5 }]));
    const image = container.querySelector('.s3d-stage img.s3d-photo');
    expect(image).toHaveAttribute('src', 'https://host.example/real.webp');
    expect(image).not.toHaveAttribute('crossorigin');
    act(() => options.onOverlayFrame(0, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 40, 50, 0, 1], 0.8));
    expect(image.style.transform).toContain('matrix3d');
    expect(image.style.opacity).toBe('0.8');
    act(() => options.onOverlayFrame(0, null, 0));
    expect(image.style.visibility).toBe('hidden');
  });
});

describe('while the 3D studio is getting ready', () => {
  const pendingScene = () => {
    let finish;
    withWebGL();
    createStudioScene.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    return (scene = fakeScene()) => act(async () => { finish(scene); });
  };
  const controlsOf = (container) => container.querySelector('fieldset.s3d-controls');
  afterEach(() => {
    vi.useRealTimers();
  });

  it('disables the reveal controls, says what is happening, and marks the stage busy', async () => {
    const finish = pendingScene();
    const { container } = render(stage());
    await waitFor(() => expect(createStudioScene).toHaveBeenCalled());
    expect(controlsOf(container)).toBeDisabled();
    expect(within(controlsOf(container)).getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(within(controlsOf(container)).getByRole('slider')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Preparing the studio');
    expect(screen.getByRole('group', { name: /^Royal Luxury Reveal/ })).toHaveAttribute('aria-busy', 'true');
    await finish();
    expect(controlsOf(container)).not.toBeDisabled();
    expect(screen.queryByText(/Preparing the studio/)).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Royal Luxury Reveal/ })).toHaveAttribute('aria-busy', 'false');
  });

  it('shows the box straight away, and the still changes with the look chosen', async () => {
    pendingScene();
    const { container, rerender } = render(stage());
    await waitFor(() => expect(createStudioScene).toHaveBeenCalled());
    expect(container.querySelector('.s3d-poster')).toHaveAttribute('src', posterFor('royal'));
    rerender(stage({ experience: EXPERIENCES.minimal }));
    expect(container.querySelector('.s3d-poster')).toHaveAttribute('src', posterFor('minimal'));
  });

  it('a look chosen while waiting is the one applied when ready', async () => {
    const finish = pendingScene();
    const scene = fakeScene();
    const { rerender } = render(stage());
    await waitFor(() => expect(createStudioScene).toHaveBeenCalled());
    rerender(stage({ experience: EXPERIENCES.minimal }));
    await finish(scene);
    await waitFor(() => expect(scene.setLook).toHaveBeenCalledWith('minimal'));
    expect(createStudioScene).toHaveBeenCalledTimes(1);
  });

  it('"Play when ready" plays as soon as it is ready, and can be changed before then', async () => {
    const finish = pendingScene();
    const scene = fakeScene();
    const user = userEvent.setup();
    render(stage());
    await waitFor(() => expect(createStudioScene).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Play when ready' }));
    expect(screen.getByRole('status')).toHaveTextContent('It will play as soon as it’s ready');
    await user.click(screen.getByRole('button', { name: 'Don’t play yet' }));
    expect(screen.getByRole('button', { name: 'Play when ready' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Play when ready' }));
    expect(scene.play).not.toHaveBeenCalled();
    await finish(scene);
    await waitFor(() => expect(scene.play).toHaveBeenCalledWith('entrance', LOOKS.royal.durations.entrance));
    expect(screen.queryByRole('button', { name: /Play when ready/ })).not.toBeInTheDocument();
  });

  it('a shopper who changes their mind before it is ready is left at rest', async () => {
    const finish = pendingScene();
    const scene = fakeScene();
    const user = userEvent.setup();
    render(stage());
    await waitFor(() => expect(createStudioScene).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Play when ready' }));
    await user.click(screen.getByRole('button', { name: 'Don’t play yet' }));
    await finish(scene);
    await waitFor(() => expect(scene.showIdle).toHaveBeenCalled());
    expect(scene.play).not.toHaveBeenCalled();
  });

  it('without the request, it waits at rest when ready', async () => {
    const finish = pendingScene();
    const scene = fakeScene();
    render(stage());
    await waitFor(() => expect(createStudioScene).toHaveBeenCalled());
    await finish(scene);
    await waitFor(() => expect(scene.showIdle).toHaveBeenCalled());
    expect(scene.play).not.toHaveBeenCalled();
  });

  it('says so if it is taking a while, and hands over to the CSS player if it takes too long', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const finish = pendingScene();
    const scene = fakeScene();
    const { container } = render(stage());
    await act(async () => { await vi.advanceTimersByTimeAsync(7100); });
    expect(screen.getByRole('status')).toHaveTextContent('taking a little longer');
    expect(container.querySelector('.xp-stage')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(INIT_LIMIT_MS); });
    expect(container.querySelector('.xp-stage')).not.toBeNull();
    // If the scene turns up after that, it's freed rather than left running.
    await finish(scene);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(scene.dispose).toHaveBeenCalled();
  });

  it('a shopper who asked to play is not made to ask again after the handover', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    pendingScene();
    const { container } = render(stage());
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    await act(async () => { screen.getByRole('button', { name: 'Play when ready' }).click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INIT_LIMIT_MS + 100); });
    expect(container.querySelector('.xp')).toHaveAttribute('data-status', 'playing');
  });

  it('asks a recipient for nothing: no prompt to add a photo, in 3D or in CSS', async () => {
    withWebGL();
    render(stage({ experience: EXPERIENCES.memory, recipient: true }));
    await waitFor(() => expect(createStudioScene).toHaveBeenCalled());
    expect(screen.queryByText(/made for your photo/)).not.toBeInTheDocument();
    cleanup();
    withoutWebGL();
    render(stage({ experience: EXPERIENCES.memory, recipient: true }));
    expect(screen.queryByText(/made for your photo/)).not.toBeInTheDocument();
  });
});

describe('share links remember the experience', () => {
  /** A link exactly as the studio used to write it: no experience in it at all. */
  const legacyLink = (template, view = 'reveal') => {
    const fragment = shareFragment(sanitizeConfig({ ...themeLook('midnight'), products: [4], name: 'Aditi', message: 'With love', template }), view);
    expect(JSON.parse(atob(fragment.slice(5).replace(/-/g, '+').replace(/_/g, '/')))).not.toHaveProperty('experience');
    return `/studio#${fragment}`;
  };
  const link = (experience, view = 'reveal', extra = {}) => `/studio#${shareFragment(sanitizeConfig({ ...themeLook('midnight'), products: [4], name: 'Aditi', message: 'With love', budget: 1500, engraving: 'A.R.', ...extra, experience }), view)}`;
  const raw = (href) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(href.split('#gift=')[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))));

  it.each(SHARED_EXPERIENCES)('%s survives the round trip', (key) => {
    expect(readShare(link(key).split('/studio')[1]).config.experience).toBe(key);
  });

  it('knows every experience the studio offers', () => {
    expect([...SHARED_EXPERIENCES].sort()).toEqual([...Object.keys(EXPERIENCES), 'classic'].sort());
  });

  it('an unrecognised experience opens on Royal rather than failing', () => {
    ['neon', 42, '', null, { a: 1 }].forEach((bad) => {
      expect(sanitizeConfig({ experience: bad }).experience).toBe('royal');
    });
  });

  it('a link with no experience stays that way, and its fields are untouched', () => {
    expect(sanitizeConfig({ template: 'surprise' })).toMatchObject({ experience: null, template: 'surprise' });
  });

  it('a surprise link still carries no budget and no printed name', () => {
    const shared = raw(link('birthday'));
    expect(shared.experience).toBe('birthday');
    expect(shared).not.toHaveProperty('budget');
    expect(shared).not.toHaveProperty('engraving');
  });

  it.each(['classic', 'surprise', 'sentimental'])('an old %s surprise link plays exactly as it always did, with no 3D code', async (template) => {
    withWebGL();
    renderApp(legacyLink(template));
    expect(await screen.findByRole('heading', { level: 1, name: 'A gift preview, just for you' })).toBeInTheDocument();
    expect(await screen.findByText(`Step 1 of ${revealSteps(template, 'card-first').length}`)).toBeInTheDocument();
    expect(createStudioScene).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Choose Your Reveal Experience' })).not.toBeInTheDocument();
  });

  it('an old friends link opens on the classic reveal, as before, and its template is kept', async () => {
    withoutWebGL();
    renderApp(legacyLink('sentimental', 'friends'));
    expect(await screen.findByRole('button', { name: 'In use: Classic reveal' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText(`Step 1 of ${revealSteps('sentimental', 'card-first').length}`)).toBeInTheDocument();
  });

  it.each(Object.values(EXPERIENCES).map((e) => [e.key, e.name]))('a surprise link for %s plays that experience, with nothing to choose and no prices', async (key, name) => {
    withoutWebGL();
    renderApp(link(key));
    expect(await screen.findByRole('heading', { level: 1, name: 'A gift preview, just for you' })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: new RegExp(`^${name}:`) })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Choose Your Reveal Experience' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Studio views' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add to cart/ })).not.toBeInTheDocument();
    expect(screen.getByRole('main').textContent).not.toMatch(/₹|1,?500/);
  });

  it('a surprise link naming Classic plays the classic reveal', async () => {
    withWebGL();
    renderApp(link('classic'));
    expect(await screen.findByText('Step 1 of 7')).toBeInTheDocument();
    expect(createStudioScene).not.toHaveBeenCalled();
  });

  it('a friends link opens on the experience it names', async () => {
    withoutWebGL();
    renderApp(link('minimal', 'friends'));
    expect(await screen.findByRole('button', { name: 'In use: Minimal Aesthetic' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('group', { name: /^Minimal Aesthetic:/ })).toBeInTheDocument();
  });

  it('a Memory surprise link does not ask its recipient for a photo', async () => {
    withoutWebGL();
    renderApp(link('memory'));
    await screen.findByRole('group', { name: /^Personalised Memory Reveal:/ });
    expect(screen.queryByText(/made for your photo/)).not.toBeInTheDocument();
  });

  it('shares the experience chosen, not one only being previewed', async () => {
    withoutWebGL();
    const { user } = renderApp('/studio?product=4');
    await user.click(await screen.findByRole('button', { name: 'Use This Experience: Sentimental Unboxing' }));
    await user.click(screen.getByRole('button', { name: 'Preview Experience: Birthday Surprise' }));
    await user.click(screen.getByRole('button', { name: '🎁 Send as a surprise preview' }));
    expect(raw(screen.getByLabelText('Share link').value).experience).toBe('sentimental');
  });

  it('warns the shopper that a Memory link goes without their photo, only when it would matter', async () => {
    withoutWebGL();
    const original = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:http://localhost/photo-1';
    try {
      const { user } = renderApp('/studio?product=4');
      await user.click(await screen.findByRole('button', { name: 'Use This Experience: Personalised Memory Reveal' }));
      expect(screen.queryByText(/Your photo stays on this device/)).not.toBeInTheDocument();
      await user.upload(document.querySelector('input[type="file"]'), new File(['x'], 'p.png', { type: 'image/png' }));
      expect(await screen.findByText(/Your photo stays on this device/)).toBeInTheDocument();
    } finally {
      URL.createObjectURL = original;
    }
  });
});

describe('the studio page', () => {
  const sources = (dir) => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : [path];
  });
  const code = sources('src').filter((p) => /\.jsx?$/.test(p) && !p.includes('test'));

  it('imports Three.js only from the scene\'s own modules, and the React side only lazily', () => {
    const importers = code.filter((p) => /from 'three(\/|')/.test(readFileSync(p, 'utf8'))).map((p) => p.replace(/\\/g, '/'));
    expect(importers.length).toBeGreaterThan(0);
    importers.forEach((p) => expect(p).toMatch(/components\/studio\/scene\/(studioScene|compareScene|boxGeometry|studioMaterials|studioEffects)\.js$/));
    const wrapper = readFileSync('src/components/studio/scene/StudioStage3D.jsx', 'utf8');
    expect(wrapper).toContain("import('./studioScene.js')");
    expect(wrapper).not.toMatch(/import\s+(?:[^'(]*from\s+)?'\.\/(studioScene|compareScene|boxGeometry|studioMaterials|studioEffects)/);
    // Compare too: its stage fetches the scene only when it's shown, and its looks are plain numbers.
    const compare = readFileSync('src/components/studio/scene/CompareStage3D.jsx', 'utf8');
    expect(compare).toContain("import('./compareScene.js')");
    expect(compare).not.toMatch(/import\s+(?:[^'(]*from\s+)?'\.\/(studioScene|compareScene|boxGeometry|studioMaterials|studioEffects)/);
    expect(readFileSync('src/components/studio/CompareLab.jsx', 'utf8')).not.toMatch(/from '\.\/scene\/(studioScene|compareScene|boxGeometry|studioMaterials|studioEffects)/);
    expect(readFileSync('src/components/studio/scene/compareLooks.js', 'utf8')).not.toMatch(/from 'three|from '\.\/(studioScene|compareScene|boxGeometry|studioMaterials|studioEffects)/);
    // The checks that decide whether to download it must not need it.
    expect(readFileSync('src/components/studio/scene/quality.js', 'utf8')).not.toMatch(/from '/);
    expect(readFileSync('src/components/studio/scene/looks.js', 'utf8')).not.toMatch(/from '/);
    expect(readFileSync('src/components/studio/scene/choreography.js', 'utf8')).not.toMatch(/from '/);
  });

  it('review switches do nothing in a normal production build', () => {
    expect(readFileSync('src/components/studio/scene/StudioStage3D.jsx', 'utf8')).toMatch(/if \(!\(import\.meta\.env\.DEV \|\| import\.meta\.env\.VITE_STUDIO_REVIEW === '1'\)\) return \{\};/);
  });

  it('opens on the Royal experience, keeps the CSS fallback in jsdom, and has no accessibility violations', async () => {
    withoutWebGL();
    const { container } = renderApp('/studio?product=4&occasion=birthday&budget=1500');
    await screen.findByRole('button', { name: 'In use: Royal Luxury Reveal' });
    expect(container.querySelector('.studio-room')).not.toBeNull();
    await waitFor(() => expect(container.querySelector('.xp-stage')).not.toBeNull());
    const { violations } = await axe.run(document, { rules: { 'color-contrast': { enabled: false } }, resultTypes: ['violations'] });
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  it('the Classic reveal can still be chosen', async () => {
    withoutWebGL();
    const { user } = renderApp('/studio?product=4');
    await user.click(await screen.findByRole('button', { name: 'Use This Experience: Classic reveal' }));
    expect(await screen.findByText('Step 1 of 7')).toBeInTheDocument();
  });
});
