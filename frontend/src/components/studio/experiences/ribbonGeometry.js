/**
 * Bow geometry: a ribbon loop is a strip bent along a closed curve, so it is built as short flat segments placed along
 * that curve, each with its own shade. That gives it real volume from any angle, which a flat picture of a bow can't.
 */

/** Segments between consecutive points of a closed curve: where each sits, how long it is, and how it is angled. */
function segmentsAlong(points) {
  return points.slice(0, -1).map((p, i) => {
    const q = points[i + 1];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const angle = Math.atan2(dy, dx);
    // Lit from above: the curve runs over the top going forward and under coming back, so the strip brightens
    // where it runs forward and level, and falls into shadow on the way back.
    const faceUp = Math.cos(angle);
    return {
      x: Number(((p.x + q.x) / 2).toFixed(2)),
      y: Number(((p.y + q.y) / 2).toFixed(2)),
      length: Number((Math.hypot(dx, dy) + 0.7).toFixed(2)), // a slight overlap, so no seam shows between segments
      angle: Number(((angle * 180) / Math.PI).toFixed(2)),
      dark: Number(Math.max(0, Math.min(0.62, 0.3 - faceUp * 0.28)).toFixed(3)),
      shine: Number(Math.max(0, faceUp - 0.72).toFixed(3)),
    };
  });
}

/** One loop of a bow, leaving the knot at (0, 0) and returning to it: a teardrop, fuller toward its far end. */
export function bowLoop({ length, height, segments = 16 }) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const reach = 0.5 - 0.5 * Math.cos(t);
    const lift = Math.sin(t) * (Math.sin(t) > 0 ? height : height * 0.24) * (0.62 + 0.38 * reach);
    points.push({ x: length * reach, y: -lift });
  }
  return segmentsAlong(points);
}

/** The knot: a short band wrapped round the centre, as a rounded rectangle. */
export function bowKnot({ width, height, segments = 12 }) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const round = (v) => Math.sign(v) * Math.abs(v) ** 0.6;
    points.push({ x: (width / 2) * round(Math.cos(t)), y: (height / 2) * round(Math.sin(t)) });
  }
  return segmentsAlong(points);
}
