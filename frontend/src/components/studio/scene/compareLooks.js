/**
 * Compare in the 3D studio: a shopper's own choices (box colour, ribbon, wrap, card) as a look for the studio's one box,
 * and how the stage is shared between the two options. No Three.js here, so the page can read it before any 3D code.
 */
import { THEMES } from '../look.js';
import { DARK_SET, LOOKS } from './looks.js';

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toInt = ([r, g, b]) => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
/** A colour as the number Three.js reads. */
export const hexToInt = (hex) => toInt(channels(hex));
/** Part of the way from one colour to another, as a number Three.js reads. */
export const mixHex = (from, to, t) => toInt(channels(from).map((c, i) => c + (channels(to)[i] - c) * t));
/** How light a colour looks (WCAG relative luminance, 0 to 1). */
export function luminance(hex) {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * How each wrap is finished on the studio's box. Satin is the studio's deep lacquer; plain a quieter semi-matte; the
 * printed wraps a coated paper; kraft a dry, uncoated board.
 */
export const FINISHES = {
  satin: { roughness: 0.46, specular: 0.42, coat: 1, coatRoughness: 0.11, grain: 0.16 },
  plain: { roughness: 0.62, specular: 0.34, coat: 0.2, coatRoughness: 0.42, grain: 0.1 },
  stripes: { roughness: 0.58, specular: 0.3, coat: 0.28, coatRoughness: 0.36, grain: 0.1 },
  dots: { roughness: 0.58, specular: 0.3, coat: 0.28, coatRoughness: 0.36, grain: 0.1 },
  confetti: { roughness: 0.58, specular: 0.3, coat: 0.28, coatRoughness: 0.36, grain: 0.1 },
  botanical: { roughness: 0.6, specular: 0.3, coat: 0.24, coatRoughness: 0.38, grain: 0.1 },
  polaroid: { roughness: 0.58, specular: 0.3, coat: 0.28, coatRoughness: 0.36, grain: 0.1 },
  kraft: { roughness: 0.9, specular: 0.24, coat: 0.03, coatRoughness: 0.7, grain: 0.3 },
};

/**
 * The look for one option: the same box, bow, lighting and room as every reveal, dressed in the shopper's box colour,
 * ribbon, wrap and card style. Everything in it comes from their configuration; nothing about price or budget.
 */
export function themeLook({ theme, box, ribbon, pattern, card }) {
  const tissue = THEMES[theme].tissue;
  const lightBox = luminance(box) > 0.35;
  return {
    box: { color: hexToInt(box), ...FINISHES[pattern] },
    // Satin and plain are the box's own finish; the other wraps are printed over its colour.
    wrap: pattern === 'satin' || pattern === 'plain' ? null : { pattern, box },
    lining: { color: mixHex(tissue, '#000000', 0.18), sheen: mixHex(tissue, '#ffffff', 0.2) },
    // Satin catches far more light than a flat swatch, so it's dyed a little deeper to read as the colour they chose.
    ribbon: { color: mixHex(ribbon, '#000000', 0.24), roughness: 0.38, metalness: 0.28, sheen: mixHex(ribbon, '#ffffff', 0.3) },
    // A stamped wordmark that reads on the box: a deep tone on a light box, champagne foil on a dark one.
    foil: lightBox ? mixHex(box, '#000000', 0.62) : 0xe0c692,
    tissue: hexToInt(tissue),
    card,
    set: DARK_SET,
    band: { width: 0.22, cross: true },
    bow: 'double',
    arrival: 'settle',
    lid: 'weighted',
    durations: LOOKS.royal.durations,
    poses: LOOKS.royal.poses,
    reveal: { tissue: [0.02, 0.55], print: [0.3, 0.86], card: 'rest' },
  };
}

/** Wider than this, the two options stand side by side; narrower (a phone), one above the other. */
export const SIDE_BY_SIDE_FROM = 1.15;

/** Each option's share of the stage, in CSS pixels from the top left: A first, then B. A single option has all of it. */
export function splitRects(width, height, count = 2) {
  if (count === 1) return [{ x: 0, y: 0, w: width, h: height }];
  if (width / height >= SIDE_BY_SIDE_FROM) {
    const half = Math.floor(width / 2);
    return [{ x: 0, y: 0, w: half, h: height }, { x: half, y: 0, w: width - half, h: height }];
  }
  const half = Math.floor(height / 2);
  return [{ x: 0, y: 0, w: width, h: half }, { x: 0, y: half, w: width, h: height - half }];
}
