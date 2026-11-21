/**
 * How much the 3D box asks of a device. No Three.js here: this runs before any 3D code is downloaded, so a device that
 * can't manage real-time 3D never pays for it. A large canvas gives up sharpness first, keeping its light and shadow
 * for as long as it can; a small one holds on to sharpness (see pixelRatioFor), because softness shows most there.
 */
export const QUALITY = {
  high: { key: 'high', pixelRatio: 2, reflection: 512, shadow: 'soft' },
  medium: { key: 'medium', pixelRatio: 1.25, reflection: 256, shadow: 'lite' },
  reduced: { key: 'reduced', pixelRatio: 1, reflection: 256, shadow: 'lite' },
  low: { key: 'low', pixelRatio: 1, reflection: 0, shadow: 'contact' },
};

const STEPS = ['high', 'medium', 'reduced', 'low'];
/** A frame forced to finish on the GPU that takes longer than this steps down, while the scene is starting. */
export const PROBE_BUDGET_MS = 33;
/** Slower than this even at the lowest quality, and stills are the kinder choice. */
export const GIVE_UP_MS = 90;
/**
 * Frames arriving slower than this, while the box is moving, step down. A steady 30 fps (33 ms) is smooth, and is what a
 * display's refresh gives a GPU that just misses 60, so it isn't treated as a problem.
 */
export const RUNNING_BUDGET_MS = 38;

/** A main thread slower than this at the check below would spend many seconds building the scene, so it gets stills. */
export const CPU_LIMIT_MS = 70;

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/** What this device can draw: WebGL 2 or not, and whether a real GPU is doing it. */
export function probeDevice() {
  const context = (options) => {
    try {
      return document.createElement('canvas').getContext('webgl2', options) ?? null;
    } catch {
      return null;
    }
  };
  const gl = context();
  if (!gl) return { webgl: false, software: false, renderer: '' };
  const debug = gl.getExtension?.('WEBGL_debug_renderer_info');
  const renderer = (debug && gl.getParameter?.(debug.UNMASKED_RENDERER_WEBGL)) || '';
  // The browser's own verdict: it refuses this kind of context when drawing would be done without proper hardware.
  const caveat = !context({ failIfMajorPerformanceCaveat: true });
  gl.getExtension?.('WEBGL_lose_context')?.loseContext();
  return { webgl: true, software: caveat || SOFTWARE_RENDERER.test(renderer), renderer };
}

/**
 * A small, fixed piece of arithmetic, timed, once, before anything is downloaded: how fast the main thread really is.
 * The best of three, so a passing hiccup doesn't count against the device.
 */
export function measureCpu() {
  const data = new Float64Array(4096);
  let best = Infinity;
  for (let run = 0; run < 3; run += 1) {
    const t0 = performance.now();
    for (let pass = 0; pass < 40; pass += 1) {
      for (let i = 0; i < data.length; i += 1) data[i] = Math.sqrt(data[i] + i * pass) * 0.5 + Math.sin(i);
    }
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

/** What the browser says about the device, for choosing where to start. */
export function deviceHints() {
  return {
    cores: navigator.hardwareConcurrency,
    memory: navigator.deviceMemory,
    coarse: Boolean(window.matchMedia?.('(pointer: coarse)')?.matches),
    saveData: Boolean(navigator.connection?.saveData),
  };
}

/** The quality to start at, or null when stills are the right choice from the outset. */
export function startingQuality(device, { cores, memory, coarse, saveData, cpuMs } = {}) {
  if (!device.webgl || device.software || saveData || cpuMs > CPU_LIMIT_MS) return null;
  if ((cores && cores <= 2) || (memory && memory <= 2)) return 'low';
  if (coarse || (cores && cores <= 4) || (memory && memory <= 4)) return 'medium';
  return 'high';
}

export const qualityBelow = (key) => STEPS[STEPS.indexOf(key) + 1] ?? null;

/** Sharpness for this quality. A small canvas is cheap to draw and shows softness most, so it stays sharper. */
export function pixelRatioFor(quality, deviceRatio, cssWidth) {
  const floor = cssWidth < 520 ? 1.5 : 1;
  return Math.min(deviceRatio, Math.max(quality.pixelRatio, floor));
}

/** After timing frames at a quality: stay, step down, or give up for stills. A view can ask for a tighter budget. */
export function verdict(key, averageMs, budgetMs = PROBE_BUDGET_MS) {
  if (key === 'low') return averageMs > GIVE_UP_MS ? 'give-up' : 'keep';
  return averageMs > budgetMs ? 'step-down' : 'keep';
}
