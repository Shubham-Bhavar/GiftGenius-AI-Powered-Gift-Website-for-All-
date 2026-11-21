/**
 * Some photo hosts don't allow WebGL to draw their images, though a browser will show them normally. Such a photo is
 * shown as an ordinary <img>, laid exactly over the print's window in the 3D scene. No Three.js here: this only turns the
 * window's four corners on screen into the CSS transform that puts a flat image there, in true perspective.
 */

/**
 * The CSS matrix3d that maps an element of `width` by `height`, with its origin at its top left, onto a four-sided shape.
 * `corners` are the top left, top right, bottom right and bottom left, as [x, y] in the stage's own pixels.
 */
export function matrixForQuad(width, height, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const sx = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9) return null;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  return [a / width, d / width, 0, g / width, b / height, e / height, 0, h / height, 0, 0, 1, 0, x0, y0, 0, 1];
}

/** Where the matrix sends a point of the element, for checking it. */
export function applyMatrix(m, x, y) {
  const w = m[3] * x + m[7] * y + m[15];
  return [(m[0] * x + m[4] * y + m[12]) / w, (m[1] * x + m[5] * y + m[13]) / w];
}

const smooth = (v) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};

/**
 * How visible the laid-over photo should be, from 0 to 1. It only shows once its print has mostly risen, while it faces
 * the camera, and while nothing in the scene could be in front of it: a flat image can't pass behind the box's wall, so
 * from too low an angle or too far round it fades, and the print's real name remains. `facing` is the print's surface
 * direction against the camera's, from 1 (straight on) to -1, and `clearance` is how many degrees the camera is above the
 * lowest angle at which the box's wall would cut across it.
 */
export function overlayOpacity({ rise, facing, clearance, hero = 0 }) {
  return smooth((rise - 0.55) / 0.2) * smooth((facing - 0.34) / 0.18) * smooth(clearance / 1.5) * (1 - hero);
}
