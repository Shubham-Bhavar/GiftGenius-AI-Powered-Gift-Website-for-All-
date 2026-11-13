import SafeImg from '../../common/SafeImg.jsx';
import { bowKnot, bowLoop } from './ribbonGeometry.js';

// The box in pixels: wide and shallow, like a presentation box. The lid sits on the walls and hinges at the back seam.
const W = 264; // width
const D = 200; // depth
const H = 84; // wall height
const L = 30; // lid depth
const T = 5; // wall thickness
const LIFT = 0.8; // how far the ribbon stands off the surface it lies on
const RISER = 58; // how far the display riser lifts the gift off the floor of the box
const DISC_R = 186; // the turntable's radius: clear of the box's corners at any angle
const DISC_H = 8; // the turntable's height: the box stands on it, and the floor is this far below
const DISC_EDGE = Array.from({ length: 36 }, (_, i) => i * 10);

const BOWS = {
  full: { loop: bowLoop({ length: 62, height: 34 }), loopWidth: 18, knot: bowKnot({ width: 17, height: 14 }), knotWidth: 19, rise: 8, tail: 84, tailWidth: 16 },
  slim: { loop: bowLoop({ length: 44, height: 23 }), loopWidth: 10, knot: bowKnot({ width: 11, height: 9 }), knotWidth: 11, rise: 5, tail: 58, tailWidth: 9 },
  knot: { knot: bowKnot({ width: 10, height: 7 }), knotWidth: 10, rise: 3.5 },
};
const CENTRED = [{ x: 0, z: 22, size: 1 }, { x: -76, z: -30, size: 0.7 }, { x: 76, z: -30, size: 0.7 }];
const UP = 'rotateX(90deg)';
const DOWN = 'rotateX(-90deg)';
const place = (x, y, z, turn = '') => `translate3d(${x}px, ${y}px, ${z}px) ${turn} translate(-50%, -50%)`;

/** One flat panel: its size, where its centre sits, and which way it faces. */
function Face({ w, h, at, turn, className, children }) {
  return <div className={`xp-f ${className}`} style={{ width: w, height: h, transform: place(...at, turn) }}>{children}</div>;
}

/** The four sides of a rectangle, for walls and rims: front, back, right, left. */
function sides(width, depth, centre = [0, 0, 0]) {
  const [x, y, z] = centre;
  return [
    { key: 'front', span: width, at: [x, y, z + depth / 2], turn: '' },
    { key: 'back', span: width, at: [x, y, z - depth / 2], turn: 'rotateY(180deg)' },
    { key: 'right', span: depth, at: [x + width / 2, y, z], turn: 'rotateY(90deg)' },
    { key: 'left', span: depth, at: [x - width / 2, y, z], turn: 'rotateY(-90deg)' },
  ];
}

/** The same four sides turned to face inward, for the lining. */
const inward = (list) => list.map((s) => ({ ...s, turn: `${s.turn} rotateY(180deg)` }));
const WALLS = sides(W, D, [0, -H / 2, 0]);
const SKIRTS = sides(W, D, [0, -L / 2, D / 2]);

/** A single-band ribbon runs across the box, so only the side walls carry it. */
const carriesBand = (key, cross) => cross || key === 'right' || key === 'left';

function WallRibbon({ band, cross }) {
  return WALLS.filter((s) => carriesBand(s.key, cross)).map((s) => {
    const out = 1 + (2 * LIFT) / (s.key === 'front' || s.key === 'back' ? D : W);
    return (
      <Face key={s.key} w={s.span} h={H + LIFT} at={[s.at[0] * out, s.at[1], s.at[2] * out]} turn={s.turn} className={`xp-ribbon-holder xp-wall--${s.key}`}>
        <div className="xp-band xp-band--wall" style={{ width: band }} />
      </Face>
    );
  });
}

function SkirtRibbon({ band, cross }) {
  return SKIRTS.filter((s) => carriesBand(s.key, cross)).map((s) => (
    <Face key={s.key} w={s.span} h={L} turn={s.turn} className={`xp-ribbon-holder xp-wall--${s.key}`}
      at={[s.at[0] * (1 + (2 * LIFT) / W), s.at[1], s.key === 'front' ? D + LIFT : s.key === 'back' ? -LIFT : D / 2]}>
      <div className="xp-band xp-band--skirt" style={{ width: band }} />
    </Face>
  ));
}

function RibbonSegments({ segments, width }) {
  return segments.map((s) => (
    <div key={`${s.x}-${s.y}`} className="xp-seg"
      style={{
        width: s.length, height: width, '--dark': s.dark, '--shine': s.shine,
        transform: `translate3d(${s.x}px, ${s.y}px, 0) rotateZ(${s.angle}deg) rotateX(90deg) translate(-50%, -50%)`,
      }} />
  ));
}

/** The bow: strips bent along a curve (see ribbonGeometry), so it has real volume from any angle. */
function Bow({ kind }) {
  const bow = BOWS[kind];
  const tail = (angle) => (
    <div className="xp-tail-pivot" style={{ transform: `translate3d(0, 0, 0) rotateY(${angle}deg) rotateX(90deg)` }}>
      <div className="xp-tail" style={{ width: bow.tail, height: bow.tailWidth, top: -bow.tailWidth / 2 }} />
    </div>
  );
  return (
    <div className="xp-bow" style={{ transform: `translate3d(0, ${-L - LIFT - 0.8}px, ${D / 2}px)` }}>
      {bow.tail && tail(-38)}
      {bow.tail && tail(218)}
      {bow.loop && (
        <>
          <div className="xp-loop" style={{ transform: `translate3d(2px, ${-bow.rise}px, 0) rotateZ(-9deg) rotateY(-10deg)` }}>
            <div className="xp-loop-shape"><RibbonSegments segments={bow.loop} width={bow.loopWidth} /></div>
          </div>
          <div className="xp-loop" style={{ transform: `translate3d(-2px, ${-bow.rise}px, 0) rotateY(180deg) rotateZ(-9deg) rotateY(-10deg)` }}>
            <div className="xp-loop-shape"><RibbonSegments segments={bow.loop} width={bow.loopWidth} /></div>
          </div>
        </>
      )}
      <div className="xp-knot" style={{ transform: `translate3d(0, ${-bow.rise}px, 0)` }}>
        <div className="xp-loop-shape"><RibbonSegments segments={bow.knot} width={bow.knotWidth} /></div>
      </div>
    </div>
  );
}

/** A display riser, standing on the floor of the box and lifting with the gift, so the gift doesn't float. */
function Riser({ width, depth, x, z, height }) {
  const faces = sides(width, depth, [x, -height / 2, z]);
  return (
    <div className="xp-riser">
      <Face w={width} h={depth} at={[x, -height, z]} turn={UP} className="xp-riser-top" />
      {faces.map((f) => <Face key={f.key} w={f.span} h={height} at={f.at} turn={f.turn} className={`xp-riser-side xp-riser-side--${f.key}`} />)}
    </div>
  );
}

/** Up to three gifts stand in the box on risers, the first largest. Each photo always faces the viewer. */
function Gifts({ items, spots }) {
  const shown = items.slice(0, 3);
  return (
    <>
      {shown.map((p, i) => {
        const rise = i === 0 ? RISER : RISER - 18;
        return <Riser key={p.id} width={i === 0 ? 118 : 80} depth={i === 0 ? 74 : 56} x={spots[i].x} z={spots[i].z} height={rise + T} />;
      })}
      {shown.map((p, i) => (
        <div key={p.id} className="xp-gift-anchor"
          style={{ '--gx': `${spots[i].x}px`, '--gy': `${-(i === 0 ? RISER : RISER - 18) - T}px`, '--gz': `${spots[i].z}px`, '--gs': spots[i].size }}>
          <div className="xp-gift" style={{ '--gift-stagger': `${i * 120}ms` }}>
            <SafeImg src={p.image} alt="" />
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * The floor's mirror image of the box, seen through the glossy floor. Only what a reflection can show: the outer walls,
 * the lid and the ribbon on them, and it moves with the real one because the same stage animations apply to it.
 */
function Reflection({ band, cross }) {
  return (
    <div className="xp-mirror" style={{ transform: `translateY(${DISC_H * 2}px) scale3d(1, -1, 1)` }}>
      <div className="xp-body">
        {WALLS.map((s) => <Face key={s.key} w={s.span} h={H} at={s.at} turn={s.turn} className={`xp-wall xp-wall--${s.key}`} />)}
        <WallRibbon band={band} cross={cross} />
        <div className="xp-lid-pivot" style={{ transform: `translate3d(0, ${-H}px, ${-D / 2}px)` }}>
          <div className="xp-lid">
            <Face w={W} h={D} at={[0, -L, D / 2]} turn={UP} className="xp-wall xp-lid-top" />
            {SKIRTS.map((s) => <Face key={s.key} w={s.span} h={L} at={s.at} turn={s.turn} className={`xp-wall xp-wall--${s.key} xp-skirt`} />)}
            <SkirtRibbon band={band} cross={cross} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The studio floor, its shadows, and the turntable the box stands on. All of it turns with the scene. */
function Turntable() {
  const edge = (2 * Math.PI * DISC_R) / DISC_EDGE.length + 0.8;
  return (
    <>
      <Face w={W + 240} h={D + 240} at={[0, DISC_H + 0.2, 0]} turn={UP} className="xp-shadow xp-shadow--floor" />
      <Face w={DISC_R * 2} h={DISC_R * 2} at={[0, 0, 0]} turn={UP} className="xp-disc"><i className="xp-disc-mark" /></Face>
      {DISC_EDGE.map((deg) => (
        <div key={deg} className="xp-f xp-disc-edge"
          style={{ width: edge, height: DISC_H, transform: `translate3d(0, ${DISC_H / 2}px, 0) rotateY(${deg}deg) translateZ(${DISC_R}px) translate(-50%, -50%)` }} />
      ))}
    </>
  );
}

/**
 * A gift box in CSS 3D, on a studio turntable. Every part is real geometry: double walls with a rim between them, a lid
 * with its own lining and skirt hinged at the back seam, a ribbon laid over the surfaces, and a bow with volume. The
 * look (`look`) sets its ribbon and details; its colours come from the experience's CSS. Nothing inside is drawn until
 * the lid is open, so no part of it can show through a wall.
 */
export function StudioGiftBox({ items, name, photo, look = {} }) {
  const { band = 22, cross = true, bow = 'full', spots = CENTRED, foilLine = true, photoPrints = false } = look;
  const lining = inward(sides(W - T * 2, D - T * 2, [0, -H / 2 + T / 2, 0]));
  const skirtLining = inward(sides(W - T * 2, D - T * 2, [0, -(L - T) / 2, D / 2]));
  const prints = photoPrints && photo;

  return (
    <>
      <Reflection band={band} cross={cross} />
      <Face w={1500} h={1500} at={[0, DISC_H, 0]} turn={UP} className="xp-floor" />
      <Turntable />
      <Face w={W + 70} h={D + 70} at={[0, -0.3, 0]} turn={UP} className="xp-shadow xp-shadow--soft" />
      <Face w={W + 8} h={D + 8} at={[0, -0.5, 0]} turn={UP} className="xp-shadow xp-shadow--contact" />
      <Face w={W + 30} h={120} at={[0, -0.4, -D / 2 - 40]} turn={UP} className="xp-shadow xp-shadow--lid" />

      <div className="xp-body">
        <Face w={W} h={D} at={[0, 0, 0]} turn={DOWN} className="xp-wall xp-bottom" />
        {WALLS.map((s) => <Face key={s.key} w={s.span} h={H} at={s.at} turn={s.turn} className={`xp-wall xp-wall--${s.key}`} />)}
        <WallRibbon band={band} cross={cross} />
        {lining.map((s) => (
          <Face key={s.key} w={s.span} h={H - T} at={s.at} turn={s.turn} className={`xp-lining xp-lining--wall xp-lining--${s.key}`} />
        ))}
        <Face w={W - T * 2} h={D - T * 2} at={[0, -T, 0]} turn={UP} className="xp-lining xp-lining--floor" />
        <Face w={W} h={T} at={[0, -H, D / 2 - T / 2]} turn={UP} className="xp-rim" />
        <Face w={W} h={T} at={[0, -H, -D / 2 + T / 2]} turn={UP} className="xp-rim" />
        <Face w={T} h={D - T * 2} at={[W / 2 - T / 2, -H, 0]} turn={UP} className="xp-rim" />
        <Face w={T} h={D - T * 2} at={[-W / 2 + T / 2, -H, 0]} turn={UP} className="xp-rim" />
        <Face w={34} h={12} at={[-74, -H + 3, -D / 2 - 0.5]} turn="rotateY(180deg)" className="xp-hinge" />
        <Face w={34} h={12} at={[74, -H + 3, -D / 2 - 0.5]} turn="rotateY(180deg)" className="xp-hinge" />

        <Gifts items={items} spots={spots} />

        {/* The hinge: the pivot sits on the back seam, so the lid swings up and back from there. */}
        <div className="xp-lid-pivot" style={{ transform: `translate3d(0, ${-H}px, ${-D / 2}px)` }}>
          <div className="xp-lid">
            <Face w={W} h={D} at={[0, -L, D / 2]} turn={UP} className="xp-wall xp-lid-top">
              {foilLine && <span className="xp-foil-line" />}
              {prints && <img className="xp-print xp-print--lid" src={photo} alt="" />}
            </Face>
            {SKIRTS.map((s) => <Face key={s.key} w={s.span} h={L} at={s.at} turn={s.turn} className={`xp-wall xp-wall--${s.key} xp-skirt`} />)}
            {skirtLining.map((s) => (
              <Face key={s.key} w={s.span} h={L - T} at={s.at} turn={s.turn} className="xp-lining xp-lining--skirt" />
            ))}
            <Face w={W - T * 2} h={D - T * 2} at={[0, -L + T, D / 2]} turn={DOWN} className={`xp-lining xp-lining--ceiling${prints ? ' has-print' : ''}`}>
              {prints && <img className="xp-print xp-print--lining" src={photo} alt="" />}
              {name && <span className="xp-foil-name">For {name}</span>}
            </Face>
            <Face w={W} h={T} at={[0, 0, D - T / 2]} turn={DOWN} className="xp-rim xp-rim--lid" />
            <Face w={W} h={T} at={[0, 0, T / 2]} turn={DOWN} className="xp-rim xp-rim--lid" />
            <Face w={T} h={D - T * 2} at={[W / 2 - T / 2, 0, D / 2]} turn={DOWN} className="xp-rim xp-rim--lid" />
            <Face w={T} h={D - T * 2} at={[-W / 2 + T / 2, 0, D / 2]} turn={DOWN} className="xp-rim xp-rim--lid" />

            <SkirtRibbon band={band} cross={cross} />
            {cross && <Face w={band} h={D / 2} at={[0, -L - LIFT, D * 0.25]} turn={UP} className="xp-band xp-band--top xp-peel-up" />}
            {cross && <Face w={band} h={D / 2} at={[0, -L - LIFT, D * 0.75]} turn={UP} className="xp-band xp-band--top xp-peel-down" />}
            <Face w={W / 2} h={band} at={[-W / 4, -L - LIFT - 0.3, D / 2]} turn={UP} className="xp-band xp-band--across xp-peel-left" />
            <Face w={W / 2} h={band} at={[W / 4, -L - LIFT - 0.3, D / 2]} turn={UP} className="xp-band xp-band--across xp-peel-right" />
            <Bow kind={bow} />
          </div>
        </div>
      </div>
    </>
  );
}
