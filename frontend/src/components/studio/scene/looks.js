/**
 * How each reveal experience looks and moves in the 3D studio. All five share one box, one camera, one lighting rig and
 * one set of material types: only the values below change. No Three.js here, so the page can read this before any 3D
 * code is downloaded. Words and rules (names, cards, what's said aloud) stay in experiences.js, shared with the CSS player.
 */

const CAMERA = { tilt: 22, dolly: 1 };
const pose = (yaw, tilt = CAMERA.tilt, dolly = CAMERA.dolly) => ({ yaw, tilt, dolly });

/** The dark studio all but the Minimal look share. */
export const DARK_SET = { horizon: 0x0a0c0d, pool: 0x2e3333, glow: 0x4f5f58, env: 1, key: 150, rim: 1.5, inside: 1.5, exposure: 1.12, shadow: 0.72, reflection: 0.8, ring: 0x7d6d50 };

export const LOOKS = {
  royal: {
    box: { color: 0x040506, roughness: 0.52, specular: 0.28, coat: 1, coatRoughness: 0.13, grain: 0.2 },
    lining: { color: 0x0c3b2e, sheen: 0x2c8f72 },
    ribbon: { color: 0xa18758, roughness: 0.39, metalness: 0.32, sheen: 0xe9cf9c },
    foil: 0xe0c692,
    tissue: 0xc9c2b2,
    set: DARK_SET,
    band: { width: 0.24, cross: true },
    bow: 'double',
    arrival: 'settle',
    lid: 'weighted',
    durations: { entrance: 1500, rotation: 1600, ribbon: 2200, lid: 2000, reveal: 3400 },
    poses: { idle: pose(-30), start: pose(-68, 21, 1.1), entrance: pose(-46, 21, 1.04), rotation: pose(-24, 25, 0.98), ribbon: pose(-26, 31, 0.9), lid: pose(-22, 25, 1), reveal: pose(-18, 26, 0.92) },
    reveal: { tissue: [0.02, 0.55], print: [0.36, 0.86], card: 'rest' },
    effect: { type: 'dust', stage: 'lid', at: 0.5, color: 0xe6cc94, count: 34 },
  },
  birthday: {
    box: { color: 0xb9564a, roughness: 0.44, specular: 0.42, coat: 1, coatRoughness: 0.11, grain: 0.16 },
    lining: { color: 0xbfa56a, sheen: 0xf0dfa9 },
    ribbon: { color: 0xb9963f, roughness: 0.38, metalness: 0.3, sheen: 0xf0dc9a },
    foil: 0x561f14,
    tissue: 0xcfc6ae,
    set: { ...DARK_SET, horizon: 0x100c0c, pool: 0x3a2d2b, glow: 0x6a4a40, shadow: 0.68 },
    band: { width: 0.24, cross: true },
    bow: 'double',
    arrival: 'bounce',
    lid: 'pop',
    durations: { entrance: 1400, rotation: 1100, ribbon: 1300, lid: 1500, reveal: 2800 },
    poses: { idle: pose(-32), start: pose(-58, 21, 1.02), entrance: pose(-42, 21, 1.02), rotation: pose(-28, 25, 0.98), ribbon: pose(-30, 30, 0.92), lid: pose(-22, 24, 1.02), reveal: pose(-18, 24, 0.96) },
    reveal: { print: [0.04, 0.5], card: 'pop', cardAt: [0.34, 0.8] },
    effect: { type: 'confetti', stage: 'lid', at: 0.3, count: 96, colors: [0xc8452f, 0xe2b63f, 0xf3ead6, 0x2f9c98, 0xee9273] },
  },
  sentimental: {
    box: { color: 0x3d0810, roughness: 0.46, specular: 0.42, coat: 1, coatRoughness: 0.12, grain: 0.18 },
    lining: { color: 0xc4b89d, sheen: 0xf4ecd8 },
    ribbon: { color: 0xc4ad82, roughness: 0.4, metalness: 0.28, sheen: 0xf0dfbb },
    foil: 0xe8cfa2,
    tissue: 0xcbc3b2,
    set: { ...DARK_SET, horizon: 0x0d0808, pool: 0x322325, glow: 0x5c3238 },
    band: { width: 0.2, cross: true },
    bow: 'double',
    arrival: 'still',
    lid: 'slow',
    durations: { entrance: 2000, rotation: 2000, ribbon: 3000, lid: 2600, reveal: 6400 },
    poses: { idle: pose(-28), start: pose(-46, 24, 0.64), entrance: pose(-38, 23, 0.8), rotation: pose(-24, 22, 0.9), ribbon: pose(-24, 28, 0.82), lid: pose(-20, 23, 0.98), reveal: pose(-18, 26, 0.94) },
    reveal: { hero: [0.03, 0.12, 0.46, 0.58], tissue: [0.56, 0.82], print: [0.68, 0.98], card: 'hero' },
    effect: { type: 'petals', stage: 'reveal', at: 0.6, colors: [0x8d1c2e, 0xa52b3c, 0x6f1423, 0xc65a64], count: 30 },
  },
  minimal: {
    box: { color: 0xf4efe4, roughness: 0.66, specular: 0.35, coat: 0.16, coatRoughness: 0.4, grain: 0.08 },
    lining: { color: 0xe2d9c6, sheen: 0xf6efe0 },
    ribbon: { color: 0xa48f6c, roughness: 0.5, metalness: 0.08, sheen: 0xd9c9ab },
    foil: 0x6d5c43,
    tissue: 0xe2dccf,
    set: { horizon: 0xb3ad9f, pool: 0xeee8dc, glow: 0x24221e, env: 1.75, key: 44, rim: 0.7, inside: 0.9, exposure: 1, shadow: 0.2, reflection: 0.1, ring: 0xc4baa6, ringMetal: 0 },
    band: { width: 0.095, cross: false },
    bow: 'knot',
    arrival: 'still',
    lid: 'soft',
    durations: { entrance: 1000, rotation: 2600, ribbon: 1500, lid: 2300, reveal: 3200 },
    poses: { idle: pose(-28), start: pose(-78, 22, 1.02), entrance: pose(-64, 22, 1.02), rotation: pose(-26, 24, 1), ribbon: pose(-26, 26, 0.94), lid: pose(-22, 24, 1), reveal: pose(-20, 24, 0.96) },
    reveal: { tissue: [0.06, 0.58], print: [0.42, 0.96] },
  },
  memory: {
    box: { color: 0x9b8e7c, roughness: 0.94, specular: 0.28, coat: 0.03, coatRoughness: 0.7, grain: 0.3, woven: true },
    lining: { color: 0xc5ad9a, sheen: 0xeddccb },
    ribbon: { color: 0x7d5255, roughness: 0.44, metalness: 0.14, sheen: 0xc9a3a3 },
    foil: 0x4a3b2c,
    tissue: 0xcdc4b8,
    set: { ...DARK_SET, horizon: 0x0f0d0b, pool: 0x38302a, glow: 0x5c4c3f, key: 165, shadow: 0.66 },
    band: { width: 0.13, cross: false },
    bow: 'single',
    arrival: 'settle',
    lid: 'weighted',
    durations: { entrance: 1200, rotation: 1500, ribbon: 1900, lid: 2000, reveal: 3200 },
    poses: { idle: pose(-26, 29), start: pose(-58, 20, 1.06), entrance: pose(-40, 24, 1.02), rotation: pose(-18, 34, 0.94), ribbon: pose(-18, 38, 0.9), lid: pose(-14, 25, 1), reveal: pose(-14, 25, 0.94) },
    reveal: { tissue: [0.04, 0.5], print: [0.3, 0.8], card: 'rest' },
    effect: { type: 'dust', stage: 'lid', at: 0.55, color: 0xf2dcc0, count: 24 },
    photoPrints: true,
  },
};

export const LOOK_KEYS = Object.keys(LOOKS);

/** The still of each look, shown instantly while the 3D scene gets ready, and in the selector. */
export const posterFor = (key) => `/studio/reveal-${key}.webp`;
export const thumbFor = (key) => `/studio/reveal-${key}-thumb.webp`;
