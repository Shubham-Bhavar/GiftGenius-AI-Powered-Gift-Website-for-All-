import { useCallback, useEffect, useMemo, useRef } from 'react';
import { prefersReducedMotion } from '../../../animations/motion.js';

const MIN_TILT = -62;
const MAX_TILT = -8;
/** How quickly the box eases toward where it's heading (per second). */
const SPEED = 2.6;
/** The 360° view: a full turn every 15 seconds, the pace of a studio turntable. */
const SPIN_DEGREES_PER_SECOND = 24;

/** The light sits high, to the camera's front left: how much each wall turned toward it is shaded less. */
export function faceShades(yaw) {
  const shade = (normal) => {
    const facing = Math.cos(((yaw + normal + 28) * Math.PI) / 180);
    return Math.max(0, Math.min(0.66, 0.38 - facing * 0.38)).toFixed(3);
  };
  return { front: shade(0), right: shade(90), back: shade(180), left: shade(-90) };
}

/** Any turn, as a position on the dial: 0 to 359 degrees. */
export const dialAngle = (yaw) => ((Math.round(yaw) % 360) + 360) % 360;

function applyPose(el, pose) {
  if (!el) return;
  const { front, right, back, left } = faceShades(pose.y);
  el.style.setProperty('--rx', `${pose.x.toFixed(2)}deg`);
  el.style.setProperty('--ry', `${pose.y.toFixed(2)}deg`);
  el.style.setProperty('--shade-front', front);
  el.style.setProperty('--shade-right', right);
  el.style.setProperty('--shade-back', back);
  el.style.setProperty('--shade-left', left);
  // The softbox's reflection slides across the lid as the box turns under it.
  el.style.setProperty('--sheen', `${((dialAngle(pose.y) / 360) * 200).toFixed(1)}%`);
}

/**
 * Turns a 3D scene: the experience sets where the camera is heading, and the shopper can drag, use the arrow keys or
 * the dial at any time, adding their own turn on top. It can also spin like a studio turntable. It writes CSS variables
 * straight to the element, so turning never re-renders React, and the frame loop runs only while something is moving.
 * `onAngle` hears each new dial position.
 */
export function useTurntable(start, onAngle) {
  const sceneRef = useRef(null);
  const motion = useRef({ x: start.x, y: start.y, targetX: start.x, targetY: start.y, userX: 0, userY: 0, spin: false });
  const frame = useRef(0);
  const last = useRef(0);
  const drag = useRef(null);

  const show = useCallback(() => {
    applyPose(sceneRef.current, motion.current);
    onAngle?.(dialAngle(motion.current.y));
  }, [onAngle]);

  const stop = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);

  const wake = useCallback(() => {
    const m = motion.current;
    const headingX = () => Math.max(MIN_TILT, Math.min(MAX_TILT, m.targetX + m.userX));
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      m.x = headingX();
      m.y = m.targetY + m.userY;
      show();
      return;
    }
    if (frame.current) return;
    last.current = 0;
    const tick = (now) => {
      const dt = last.current ? Math.min(0.05, (now - last.current) / 1000) : 1 / 60;
      last.current = now;
      if (m.spin && !drag.current) m.userY += SPIN_DEGREES_PER_SECOND * dt;
      const ease = 1 - Math.exp(-dt * SPEED);
      const toX = headingX();
      const toY = m.targetY + m.userY;
      m.x += (toX - m.x) * ease;
      m.y += (toY - m.y) * ease;
      show();
      frame.current = m.spin || Math.abs(toX - m.x) + Math.abs(toY - m.y) > 0.02 ? requestAnimationFrame(tick) : 0;
    };
    frame.current = requestAnimationFrame(tick);
  }, [show]);

  /** Where the camera heads next. `immediate` jumps there (a skip, a reset), and clears the shopper's own turn. */
  const setPose = useCallback((pose, { immediate = false } = {}) => {
    const m = motion.current;
    m.targetX = pose.x;
    m.targetY = pose.y;
    if (immediate) {
      stop();
      m.userX = 0;
      m.userY = 0;
      m.x = pose.x;
      m.y = pose.y;
      show();
      return;
    }
    wake();
  }, [show, stop, wake]);

  /** Stops heading anywhere, for a pause: the box stays where it is, and can still be turned by hand. */
  const hold = useCallback(() => {
    const m = motion.current;
    m.targetX = m.x - m.userX;
    m.targetY = m.y - m.userY;
    stop();
  }, [stop]);

  const turn = useCallback((dy, dx, snap) => {
    const m = motion.current;
    m.userY += dy;
    m.userX += dx;
    if (snap) {
      stop();
      m.y = m.targetY + m.userY;
      m.x = Math.max(MIN_TILT, Math.min(MAX_TILT, m.targetX + m.userX));
      m.userX = m.x - m.targetX; // what the tilt limit refused doesn't build up
      show();
    } else {
      wake();
    }
  }, [show, stop, wake]);

  /** Sets the dial: the box goes straight to that angle, the short way round. */
  const turnTo = useCallback((degrees) => {
    const m = motion.current;
    const here = ((m.y % 360) + 360) % 360;
    const shortest = ((degrees - here + 540) % 360) - 180;
    turn(shortest, 0, true);
  }, [turn]);

  /** The turntable's motor. It respects reduced motion: then the dial, drag and keys still turn the box by hand. */
  const setSpin = useCallback((on) => {
    const m = motion.current;
    const spin = on && !prefersReducedMotion();
    if (m.spin === spin) return;
    m.spin = spin;
    if (spin) {
      m.userY += m.y - (m.targetY + m.userY); // starts from where the box is, without a lurch
      wake();
    }
  }, [wake]);

  useEffect(() => {
    show();
    return stop;
  }, [show, stop]);

  const handlers = useMemo(() => ({
    onPointerDown: (e) => {
      drag.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      e.currentTarget.classList.add('is-dragging');
    },
    onPointerMove: (e) => {
      if (!drag.current) return;
      turn((e.clientX - drag.current.x) * 0.45, (drag.current.y - e.clientY) * 0.22, true);
      drag.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e) => {
      drag.current = null;
      e.currentTarget.classList.remove('is-dragging');
      wake();
    },
    onPointerCancel: (e) => {
      drag.current = null;
      e.currentTarget.classList.remove('is-dragging');
      wake();
    },
    onKeyDown: (e) => {
      const step = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, 6], ArrowDown: [0, -6] }[e.key];
      if (!step) return;
      e.preventDefault();
      turn(step[0], step[1], false);
    },
  }), [turn, wake]);

  return { sceneRef, setPose, hold, turnTo, setSpin, handlers };
}
