import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** The box, in units of about 10 cm. A rigid clamshell: the lid is as wide as the base and meets it at a fine seam. */
export const BOX = {
  W: 2.4, D: 2, H: 0.7, LID: 0.42, GAP: 0.005,
  WALL: 0.05, CORNER: 0.07, EDGE: 0.016, LINER: 0.008, FLOOR: 0.03, CEILING: 0.03,
};
export const PAD_TOP = 0.3;
const BOW_WIDTH = 0.31;

const RAD = Math.PI / 180;

/** The outline seen from above, as corner samples: each knows its corner's centre and its outward direction. */
function outline(w, d, r, arc = 6) {
  const hx = w / 2 - r;
  const hz = d / 2 - r;
  const corners = [[hx, hz, 0], [hx, -hz, 90], [-hx, -hz, 180], [-hx, hz, 270]];
  const points = [];
  corners.forEach(([cx, cz, from]) => {
    for (let i = 0; i <= arc; i += 1) {
      const a = (from + (90 * i) / arc) * RAD;
      points.push({ cx, cz, nx: Math.sin(a), nz: Math.cos(a) });
    }
  });
  points.push(points[0]);
  return points;
}

const geometryFrom = (position, normal, uv, uv1, index) => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  if (uv1) g.setAttribute('uv1', new BufferAttribute(new Float32Array(uv1), 2));
  g.setIndex(index);
  return g;
};

/** A quarter of a rounded edge in a wall's profile. Angles give the surface's direction: 0 outward, 90 up, 180 inward. */
export function roundEdge(inset, y, radius, from, to, steps = 4) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (from + ((to - from) * i) / steps) * RAD;
    points.push({ i: inset - radius * Math.cos(a), y: y + radius * Math.sin(a), nr: Math.cos(a), ny: Math.sin(a) });
  }
  return points;
}

/**
 * Sweeps a wall's profile around the outline. The normals are exact, so a flat side stays perfectly flat in its
 * reflections. `uv` runs in world units for tiled materials, and `uv1` runs 0 to 1 up the profile for the shading.
 */
export function sweep(w, d, profile) {
  const path = outline(w, d, BOX.CORNER);
  const position = [];
  const normal = [];
  const uv = [];
  const uv1 = [];
  const index = [];

  const lengths = [0];
  for (let j = 1; j < profile.length; j += 1) {
    lengths[j] = lengths[j - 1] + Math.hypot(profile[j].i - profile[j - 1].i, profile[j].y - profile[j - 1].y);
  }
  const total = lengths[lengths.length - 1] || 1;

  let around = 0;
  path.forEach((p, k) => {
    if (k > 0) {
      const q = path[k - 1];
      around += Math.hypot(p.cx + p.nx * BOX.CORNER - q.cx - q.nx * BOX.CORNER, p.cz + p.nz * BOX.CORNER - q.cz - q.nz * BOX.CORNER);
    }
    profile.forEach((s, j) => {
      const reach = BOX.CORNER - s.i;
      position.push(p.cx + p.nx * reach, s.y, p.cz + p.nz * reach);
      normal.push(p.nx * s.nr, s.ny, p.nz * s.nr);
      uv.push(around, lengths[j]);
      uv1.push(k / (path.length - 1), lengths[j] / total);
    });
  });

  const cols = profile.length;
  for (let k = 0; k < path.length - 1; k += 1) {
    for (let j = 0; j < cols - 1; j += 1) {
      const a = k * cols + j;
      const b = (k + 1) * cols + j;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return geometryFrom(position, normal, uv, uv1, index);
}

/** A flat rounded panel, for the top of the lid and the floors inside. */
export function cap(w, d, inset, y, up = true) {
  const path = outline(w, d, BOX.CORNER);
  const position = [0, y, 0];
  const normal = [0, up ? 1 : -1, 0];
  const uv = [0, 0];
  const uv1 = [0.5, 0.5];
  const index = [];
  const reach = BOX.CORNER - inset;
  path.forEach((p) => {
    const x = p.cx + p.nx * reach;
    const z = p.cz + p.nz * reach;
    position.push(x, y, z);
    normal.push(0, up ? 1 : -1, 0);
    uv.push(x, z);
    uv1.push(0.5 + x / (w - 2 * inset), 0.5 + z / (d - 2 * inset));
  });
  for (let k = 1; k < path.length; k += 1) {
    if (up) index.push(0, k, k + 1);
    else index.push(0, k + 1, k);
  }
  return geometryFrom(position, normal, uv, uv1, index);
}

/**
 * A length of satin from a list of frames ({ p, n, s }: position, surface normal, width direction). The cross-section
 * is cupped very slightly, so the edges catch the light as a real ribbon's do. `shade` darkens the folds, where a
 * ribbon shadows itself: painted in, because a soft shadow map can't resolve creases this fine. `aT` records how far
 * along the strip each point is, for the bands to peel away by.
 */
function ribbonStrip(frames, { width = 0.24, across = 8, cup = 0.004, widthAt = () => 1, pleat = () => 0, cut = 0, shade = () => 1 }) {
  const rows = frames.length;
  const cols = across + 1;
  const position = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const color = new Float32Array(rows * cols * 3);
  const along01 = new Float32Array(rows * cols);
  const index = [];
  const v = new Vector3();
  const tangent = new Vector3();
  let along = 0;
  let total = 0;
  frames.forEach((f, r) => {
    if (r > 0) total += f.p.distanceTo(frames[r - 1].p);
  });
  const cutRows = cut ? Math.max(4, Math.ceil(cut / ((total / (rows - 1)) * 0.8))) : 0;

  frames.forEach((f, r) => {
    if (r > 0) along += f.p.distanceTo(frames[r - 1].p);
    const t = r / (rows - 1);
    const half = (width * widthAt(t)) / 2;
    tangent.copy(frames[Math.min(r + 1, rows - 1)].p).sub(frames[Math.max(r - 1, 0)].p).normalize();
    // The swallowtail: the middle of the very end is cut back.
    const tail = cut && r >= rows - 1 - cutRows ? ((r - (rows - 1 - cutRows)) / cutRows) * cut : 0;
    for (let c = 0; c < cols; c += 1) {
      const a = (c / across) * 2 - 1;
      v.copy(f.p)
        .addScaledVector(f.s, a * half)
        .addScaledVector(f.n, cup * (1 - a * a) + pleat(t, a))
        .addScaledVector(tangent, -tail * (1 - Math.abs(a)));
      position.set([v.x, v.y, v.z], (r * cols + c) * 3);
      uv.set([c / across, along * 2.2], (r * cols + c) * 2);
      const dark = shade(t, a);
      color.set([dark, dark, dark], (r * cols + c) * 3);
      along01[r * cols + c] = along / total;
    }
  });

  // Every strip's front face is its outer surface, so the material can shade the inside of a loop.
  const mid = frames[Math.floor(rows / 2)];
  tangent.copy(frames[Math.floor(rows / 2) + 1].p).sub(mid.p);
  const outward = tangent.cross(mid.s).dot(mid.n) > 0;
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < across; c += 1) {
      const a = r * cols + c;
      if (outward) index.push(a, a + cols, a + 1, a + cols, a + cols + 1, a + 1);
      else index.push(a, a + 1, a + cols, a + cols, a + 1, a + cols + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('color', new BufferAttribute(color, 3));
  g.setAttribute('aT', new BufferAttribute(along01, 1));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A ribbon band over the lid and down both sides, hugging its rounded top edges. `axis` is the way it runs. */
function lidBand(axis, span, lift, width) {
  const { LID, EDGE } = BOX;
  const radius = EDGE + lift;
  const place = (u, y) => (axis === 'x' ? new Vector3(u, y, 0) : new Vector3(0, y, u));
  const normal = (nu, ny) => (axis === 'x' ? new Vector3(nu, ny, 0) : new Vector3(0, ny, nu));
  const s = axis === 'x' ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
  const frames = [];
  const push = (u, y, nu, ny) => frames.push({ p: place(u, y), n: normal(nu, ny), s });
  const edge = span - EDGE;
  const wall = LID - EDGE;
  for (let i = 0; i < 6; i += 1) push(span + lift, 0.002 + (wall * i) / 6, 1, 0);
  for (let i = 0; i <= 5; i += 1) {
    const a = (i / 5) * 90 * RAD;
    push(edge + Math.cos(a) * radius, wall + Math.sin(a) * radius, Math.cos(a), Math.sin(a));
  }
  // The long flat top has many rows, so the band can lift and curl as it peels away.
  for (let i = 1; i < 30; i += 1) push(edge - (2 * edge * i) / 30, wall + radius, 0, 1);
  for (let i = 0; i <= 5; i += 1) {
    const a = (i / 5) * 90 * RAD;
    push(-edge - Math.sin(a) * radius, wall + Math.cos(a) * radius, -Math.sin(a), Math.cos(a));
  }
  for (let i = 5; i >= 0; i -= 1) push(-span - lift, 0.002 + (wall * i) / 6, -1, 0);
  return ribbonStrip(frames, { width, across: 6, cup: 0.0035 });
}

/** The shape of a loop, from the side: out of the knot, over the top, round the tip and back underneath. */
const LOOP_PROFILE = [
  [0.01, 0.112], [0.2, 0.205], [0.46, 0.285], [0.7, 0.295], [0.85, 0.225], [0.83, 0.14], [0.62, 0.095], [0.34, 0.08], [0.02, 0.1],
];

/**
 * One bow loop, domed outward with its fabric gathered into pleats where it's held. `reach` and `rise` scale it, `swing`
 * turns its tip toward the back of the box, and `lean` tips its broad face toward the front (below 0) or back (above 0),
 * so that the bow as a whole shows a full surface from every side. A slight twist and soft creases keep it from looking
 * like an extrusion.
 */
function bowLoop(sign, { reach = 1, rise = 1, swing = 0, lean = 0, lift = 0, width = BOW_WIDTH, seed = 0 }) {
  const turn = swing * RAD;
  const points = LOOP_PROFILE.map(([x, y]) => new Vector3(sign * x * reach * Math.cos(turn), lift + y * rise, -x * reach * Math.sin(turn)));
  const curve = new CatmullRomCurve3(points, false, 'centripetal');
  const steps = 72;
  const hint = new Vector3(sign * Math.sin(turn) * 0.9, lean, Math.cos(turn)).normalize();
  const frames = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    let s = hint.clone().addScaledVector(tangent, -hint.dot(tangent)).normalize();
    let n = new Vector3().crossVectors(s, tangent).multiplyScalar(sign).normalize();
    const twist = sign * 11 * RAD * Math.sin(Math.PI * t) * Math.cos(seed);
    s = s.clone().multiplyScalar(Math.cos(twist)).addScaledVector(n, Math.sin(twist)).normalize();
    n = new Vector3().crossVectors(s, tangent).multiplyScalar(sign).normalize();
    frames.push({ p, n, s });
  }
  const held = (t) => Math.max(0, 1 - Math.min(t, 1 - t) / 0.24);
  const folds = (t, a) => Math.cos(a * Math.PI * 2.5 + 0.6 + seed);
  return ribbonStrip(frames, {
    width,
    across: 18,
    cup: 0.03 * (width / BOW_WIDTH),
    widthAt: (t) => 0.26 + 0.74 * Math.min(1, Math.min(t, 1 - t) / 0.26) ** 0.72,
    pleat: (t, a) => 0.015 * held(t) ** 1.3 * folds(t, a)
      + 0.006 * Math.sin(t * 7.5 + seed) * a
      + 0.0035 * Math.sin(t * 14 + seed * 2) * (1 - a * a),
    shade: (t, a) => (1 - 0.74 * held(t) ** 1.1 * (0.55 - 0.45 * folds(t, a))) * (1 - 0.26 * Math.min(1, Math.max(0, (t - 0.52) / 0.14))),
  });
}

/** A tail: from the knot across the lid, lying in a few soft waves, and cut in a swallowtail. */
function bowTail(sign, spread, reach, width, seed = 0) {
  const points = [
    [0.02, 0.085, Math.sign(reach) * 0.03], [spread * 0.3, 0.07, reach * 0.26], [spread * 0.58, 0.02, reach * 0.54], [spread * 0.8, 0.036, reach * 0.77], [spread, 0.012, reach],
  ].map(([x, y, z]) => new Vector3(sign * x, y, z));
  const curve = new CatmullRomCurve3(points, false, 'centripetal');
  const steps = 44;
  const up = new Vector3(0, 1, 0);
  const frames = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const across = new Vector3().crossVectors(tangent, up).normalize();
    const flat = new Vector3().crossVectors(across, tangent).normalize();
    const roll = 0.16 * Math.sin(t * 6 + seed) * Math.min(1, t * 3);
    const s = across.clone().multiplyScalar(Math.cos(roll)).addScaledVector(flat, Math.sin(roll)).normalize();
    const n = new Vector3().crossVectors(s, tangent).normalize();
    // Keep the width direction's outward sense consistent, whichever way the tail runs.
    frames.push({ p, n: n.y < 0 ? n.negate() : n, s });
  }
  return ribbonStrip(frames, {
    width,
    across: 10,
    cup: 0.012 * (width / BOW_WIDTH),
    cut: 0.085 * Math.min(1, (width / BOW_WIDTH) * 1.4),
    widthAt: (t) => 0.4 + 0.6 * Math.min(1, t / 0.22),
    shade: (t) => 0.42 + 0.58 * Math.min(1, t / 0.24),
  });
}

/** The knot: a flat, tailored band wrapped around the gathered loops, squared off and softly creased, so it reads as ribbon. */
function bowKnot(width, size) {
  const steps = 40;
  const frames = [];
  const s = new Vector3(1, 0, 0);
  const squared = (v) => Math.sign(v) * Math.abs(v) ** 0.72;
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    frames.push({
      p: new Vector3(0, KNOT_Y + squared(Math.sin(a)) * 0.078 * size, squared(Math.cos(a)) * 0.112 * size),
      n: new Vector3(0, Math.sin(a), Math.cos(a)),
      s,
    });
  }
  const crease = (t, a) => Math.cos(a * Math.PI * 1.6 + 0.5 + Math.sin(t * 6.3) * 0.5);
  return ribbonStrip(frames, {
    width,
    across: 16,
    cup: 0.012 * size,
    pleat: (t, a) => 0.0042 * size * crease(t, a),
    shade: (t, a) => 0.94 - 0.15 * crease(t, a) - 0.3 * Math.abs(a) ** 5,
  });
}

const KNOT_Y = 0.122;

/** The bands that lie on the lid, in the lid's coordinates. They hug it too closely to cast a shadow of their own. */
export function ribbonBands({ width, cross }) {
  const { W, D } = BOX;
  return cross
    ? mergeGeometries([lidBand('x', W / 2, 0.005, width), lidBand('z', D / 2, 0.009, width)])
    : lidBand('z', D / 2, 0.006, width);
}

const BOWS = {
  /** A tailored double bow: a large pair leaning toward the front, a smaller pair above and behind leaning toward the back. */
  double: () => ({
    loops: [
      bowLoop(1, { swing: -7, lean: -0.16, seed: 0.4 }),
      bowLoop(-1, { swing: -4, lean: -0.16, reach: 0.97, seed: 1.7 }),
      bowLoop(1, { reach: 0.66, rise: 0.92, swing: 34, lean: 0.34, lift: 0.024, width: BOW_WIDTH * 0.88, seed: 2.6 }),
      bowLoop(-1, { reach: 0.7, rise: 0.92, swing: 30, lean: 0.34, lift: 0.024, width: BOW_WIDTH * 0.88, seed: 3.9 }),
    ],
    tails: [bowTail(1, 0.5, 0.86, BOW_WIDTH * 0.84, 0.6), bowTail(-1, 0.56, 0.8, BOW_WIDTH * 0.84, 2.1)],
    knot: bowKnot(0.25, 1),
  }),
  /** One pair of loops in a narrower ribbon, for a quieter box. */
  single: () => {
    const w = BOW_WIDTH * 0.56;
    return {
      loops: [
        bowLoop(1, { reach: 0.72, rise: 0.82, swing: -5, lean: -0.1, width: w, seed: 0.9 }),
        bowLoop(-1, { reach: 0.7, rise: 0.82, swing: 8, lean: -0.1, width: w, seed: 2.2 }),
      ],
      tails: [bowTail(1, 0.3, 0.72, w * 0.9, 1.1), bowTail(-1, 0.36, 0.66, w * 0.9, 2.8)],
      knot: bowKnot(0.15, 0.78),
    };
  },
  /** No loops at all: a small flat tie and two short ends. */
  knot: () => {
    const w = BOW_WIDTH * 0.32;
    return {
      loops: [],
      tails: [bowTail(1, 0.17, 0.38, w, 0.7), bowTail(-1, 0.2, 0.33, w, 2.4)],
      knot: bowKnot(0.095, 0.5),
    };
  },
};

/**
 * A bow as separate meshes' geometry, each centred on the knot, so loops, tails and knot can each draw in toward it as
 * the ribbon is pulled. `center` is where that knot sits on the lid, in the lid's coordinates.
 */
export function ribbonBow(style) {
  const parts = BOWS[style]();
  const center = new Vector3(0, BOX.LID + 0.012 + KNOT_Y, 0);
  const merged = (list) => {
    if (!list.length) return null;
    const g = list.length === 1 ? list[0] : mergeGeometries(list);
    g.translate(0, -KNOT_Y, 0);
    return g;
  };
  return { loops: merged(parts.loops), tails: merged(parts.tails), knot: merged([parts.knot]), center };
}
