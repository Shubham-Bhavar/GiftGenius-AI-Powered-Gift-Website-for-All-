/**
 * The reveal, as plain numbers: given a look, a stage and how far through it we are, where everything should be. No
 * Three.js and no clock, so pausing, skipping and replaying can't drift, and every moment can be tested exactly.
 */

export const STAGE_ORDER = ['entrance', 'rotation', 'ribbon', 'lid', 'reveal'];
export const LID_OPEN_DEG = 104;
export const SPIN_DEG_PER_S = 24;
export const MIN_TILT = 18;
export const MAX_TILT = 48;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (v) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (v) => {
  const t = clamp01(v);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;
/** Where a moment falls inside a window of a stage, from 0 to 1. */
const within = (p, [from, to]) => clamp01((p - from) / (to - from));

/**
 * The lid's swing, from 0 to 1. Each keeps a rigid lid's weight: it leaves slowly and speeds up, with no sudden change of
 * speed anywhere. Only the ending differs: a settle, a springy pop, a long slow arrival or no overshoot at all.
 */
export const LID_CURVES = {
  weighted(p) {
    const peak = LID_OPEN_DEG + 2.4;
    if (p < 0.74) return peak * easeInOut(p / 0.74);
    return LID_OPEN_DEG + 2.4 * 0.5 * (1 + Math.cos((Math.PI * (p - 0.74)) / 0.26));
  },
  pop(p) {
    const swing = easeOut(p / 0.34);
    const ring = 12 * Math.exp(-5.5 * Math.max(0, p - 0.3)) * Math.cos(Math.max(0, p - 0.3) * 13);
    return LID_OPEN_DEG * swing + (p > 0.3 ? ring * smoothstep((p - 0.3) / 0.08) : 0);
  },
  slow(p) {
    return LID_OPEN_DEG * smootherstep(p);
  },
  soft(p) {
    return (LID_OPEN_DEG - 2) * easeInOut(p);
  },
};

/** How high the box still is above the turntable as it arrives, from 0 to 1. */
const ARRIVALS = {
  settle: (p) => 0.85 * (1 - easeOut(p / 0.86)) ** 1.15,
  /** Dropped in: falls, then each bounce is lower and shorter. Speed is right at every moment, as it would be if it were falling. */
  bounce(p) {
    const fall = 0.42;
    if (p < fall) return 1.5 * (1 - (p / fall) ** 2);
    const hops = [[fall, 0.68, 0.22], [0.68, 0.86, 0.08], [0.86, 0.97, 0.024]];
    for (const [a, b, h] of hops) {
      if (p < b) {
        const t = (p - a) / (b - a);
        return 4 * h * t * (1 - t);
      }
    }
    return 0;
  },
  still: () => 0,
};

/** Everything that can change during a reveal, at rest with the bow tied. */
const REST = {
  boxY: 0, bowTails: 0, bowLoops: 0, bowKnot: 0, bands: 0, lidDeg: 0, tissue: 0, print: 0, hero: 0, cardPop: 1, exposure: 1,
};

const ribbonAt = (p) => ({
  bowTails: smoothstep(p / 0.4),
  bowLoops: smootherstep((p - 0.12) / 0.5),
  bowKnot: smootherstep((p - 0.48) / 0.2),
  bands: smootherstep((p - 0.58) / 0.42),
});

function revealAt(look, p) {
  const r = look.reveal ?? {};
  const state = {};
  if (r.tissue) state.tissue = smootherstep(within(p, r.tissue));
  if (r.print) state.print = smootherstep(within(p, r.print));
  if (r.card === 'pop') state.cardPop = within(p, r.cardAt);
  if (r.hero) {
    const [inFrom, inTo, outFrom, outTo] = r.hero;
    state.hero = smootherstep(within(p, [inFrom, inTo])) * (1 - smootherstep(within(p, [outFrom, outTo])));
    state.exposure = 1 - 0.62 * state.hero;
  }
  return state;
}

const FINISHED = (look) => ({
  ...REST,
  bowTails: 1, bowLoops: 1, bowKnot: 1, bands: 1,
  lidDeg: look.lid === 'soft' ? LID_OPEN_DEG - 2 : LID_OPEN_DEG,
  tissue: look.reveal?.tissue ? 1 : 0,
  print: 1,
});

/** The whole state at a moment. `stage` null means at rest, ready to play; 'finished' means the reveal is over. */
export function stateAt(look, stage, p = 1) {
  const t = clamp01(p);
  if (stage === null) return { ...REST, cardPop: look.reveal?.card === 'pop' ? 0 : 1, camera: look.poses.idle };
  if (stage === 'finished') return { ...FINISHED(look), camera: look.poses.reveal };
  const index = STAGE_ORDER.indexOf(stage);
  const state = { ...REST, cardPop: look.reveal?.card === 'pop' ? 0 : 1 };
  if (index === 0) {
    state.boxY = ARRIVALS[look.arrival](t);
  }
  if (index === 2) Object.assign(state, ribbonAt(t));
  if (index > 2) Object.assign(state, ribbonAt(1));
  if (index === 3) state.lidDeg = LID_CURVES[look.lid](t);
  if (index > 3) {
    state.lidDeg = LID_CURVES[look.lid](1);
    Object.assign(state, revealAt(look, t));
  }
  const from = index === 0 ? look.poses.start : look.poses[STAGE_ORDER[index - 1]];
  const to = look.poses[stage];
  const eased = smootherstep(t);
  state.camera = { yaw: lerp(from.yaw, to.yaw, eased), tilt: lerp(from.tilt, to.tilt, eased), dolly: lerp(from.dolly, to.dolly, eased) };
  return state;
}

/** Eases a value toward its target, at the same rate whatever the frame rate. */
export const approach = (value, target, dt, speed) => value + (target - value) * (1 - Math.exp(-dt * speed));

/** How far back the camera sits to show `halfW` by `halfH` around its target, on a screen of this shape. */
export function cameraDistance(aspect, fovDeg, halfW, halfH) {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return Math.max(halfH / t, halfW / (t * aspect));
}

/** Opening a box in Compare: the reveal's last three stages, as one movement from closed (0) to open (1). */
export const OPEN_STAGES = [['ribbon', 0, 0.3], ['lid', 0.3, 0.64], ['reveal', 0.64, 1]];

/** The state of a box partly open in Compare. Closing runs the same movement backwards. */
export function openStateAt(look, o) {
  if (o <= 0) return stateAt(look, null);
  if (o >= 1) return stateAt(look, 'finished');
  const [stage, from, to] = OPEN_STAGES.find(([, , end]) => o <= end);
  return stateAt(look, stage, (o - from) / (to - from));
}
