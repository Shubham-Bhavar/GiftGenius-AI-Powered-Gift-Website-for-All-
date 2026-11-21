import { useId, useRef, useState } from 'react';
import SafeImg from '../common/SafeImg.jsx';
import { describeLook } from './look.js';

const SIDES = ['front', 'right', 'back', 'left'];

/**
 * A gift box in CSS 3D: the box, its lid and bow wear the chosen colour, wrap and ribbon. `state` is "closed",
 * "untied" (bow and ribbon gone) or "open" (lid lifted, the gifts rising out of the tissue). With `interactive`,
 * shoppers turn it by dragging or with the arrow keys. With the photo wrap, the shopper's own photos (local object
 * URLs, never uploaded) cover the sides.
 */
export function GiftBox3D({ look, items = [], photos = [], state = 'closed', interactive = false, size = 'lg', label }) {
  const [angle, setAngle] = useState({ x: -18, y: -32 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const hintId = useId();
  const turn = (dx, dy) => setAngle((a) => ({ x: Math.max(-60, Math.min(15, a.x + dy)), y: a.y + dx }));

  const handlers = interactive ? {
    tabIndex: 0,
    'aria-describedby': hintId,
    onPointerDown: (e) => {
      drag.current = { x: e.clientX, y: e.clientY };
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e) => {
      if (!drag.current) return;
      turn((e.clientX - drag.current.x) * 0.5, (drag.current.y - e.clientY) * 0.3);
      drag.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: () => {
      drag.current = null;
      setDragging(false);
    },
    onPointerCancel: () => {
      drag.current = null;
      setDragging(false);
    },
    onKeyDown: (e) => {
      const step = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, 8], ArrowDown: [0, -8] }[e.key];
      if (!step) return;
      e.preventDefault();
      turn(...step);
    },
  } : {};

  const photoWrap = look.pattern === 'polaroid' && photos.length > 0;
  const faceStyle = (i) => (photoWrap ? { backgroundImage: `url("${photos[i % photos.length]}")` } : undefined);
  const faceClass = `gb3d-face gb3d-wrap gb3d-pattern--${look.pattern}${photoWrap ? ' gb3d-photo' : ''}`;

  return (
    <div
      className={`gb3d gb3d--${size} gb3d--${state}${dragging ? ' is-dragging' : ''}`}
      style={{ '--box': look.box, '--ribbon': look.ribbon, '--tissue': look.tissue }}
      role="group" aria-roledescription="3D gift box preview" aria-label={label ?? describeLook(look)}
      {...handlers}
    >
      {/* The turn is passed as variables: the scene rotates by them, and the gifts inside turn back by them. */}
      <div className="gb3d-scene" style={{ '--rx': `${angle.x}deg`, '--ry': `${angle.y}deg` }}>
        <div className="gb3d-base">
          {SIDES.map((side, i) => <div key={side} className={`${faceClass} gb3d-side gb3d-${side}`} style={faceStyle(i)} />)}
          <div className={`${faceClass} gb3d-bottom`} />
          <div className="gb3d-face gb3d-tissue" />
          <div className="gb3d-items" aria-hidden="true">
            {items.slice(0, 4).map((p) => <SafeImg key={p.id} src={p.image} alt="" className="gb3d-item" />)}
          </div>
        </div>
        <div className="gb3d-lid">
          <div className={`${faceClass} gb3d-lid-top`} />
          {SIDES.map((side) => <div key={side} className={`${faceClass} gb3d-lid-side gb3d-lid-${side}`} />)}
          <div className="gb3d-bow">
            <span className="gb3d-bow-plane"><i /><i /><b /></span>
            <span className="gb3d-bow-plane gb3d-bow-plane--cross"><i /><i /><b /></span>
          </div>
        </div>
      </div>
      <div className="gb3d-shadow" />
      {interactive && <p className="sr-only" id={hintId}>Drag the box, or use the arrow keys, to turn it.</p>}
    </div>
  );
}
