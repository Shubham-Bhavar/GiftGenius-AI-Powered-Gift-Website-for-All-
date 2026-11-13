import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../../animations/motion.js';
import { GiftBox3D } from '../GiftBox3D.jsx';
import { THEMES, describeLook } from '../look.js';
import { splitRects, themeLook } from './compareLooks.js';
import { chooseStart, INIT_LIMIT_MS, reviewOptions, SLOW_NOTICE_MS } from './StudioStage3D.jsx';
import '../../../styles/studio/studio-room.css';

/** The CSS box's look for a configuration, as the CSS preview draws it. */
export const cssLookOf = (c) => ({ box: c.box, ribbon: c.ribbon, pattern: c.pattern, tissue: THEMES[c.theme].tissue });

/** What the scene needs to know about an option's gift: the products, and the shopper's own name, words and photos. Never a price. */
function giftOf(config, items, photos) {
  const name = config.name.trim();
  return { items: items.map(({ id, name: productName, image }) => ({ id, name: productName, image })), heading: name && `For ${name}`, message: config.message.trim(), photos };
}

function Labels({ options, rects }) {
  return options.map((o, i) => (
    <div key={o.key} className="cmp-half" style={rects ? { left: rects[i].x, top: rects[i].y, width: rects[i].w, height: rects[i].h } : undefined}>
      <p className="cmp-label" aria-hidden="true">
        <span className="cmp-letter">{o.key}</span>
        <span className="cmp-caption">{o.caption}</span>
      </p>
    </div>
  ));
}

function OpenToggle({ open, onOpen }) {
  return (
    <div className="cmp-open" role="group" aria-label="Show the boxes">
      <button type="button" className="xp-button" aria-pressed={!open} onClick={() => onOpen(false)}>Closed</button>
      <button type="button" className="xp-button" aria-pressed={open} onClick={() => onOpen(true)}>Open</button>
    </div>
  );
}

/** The stage's description for screen readers: each option's look, in words. */
const describe = (options) => options.map((o) => `Option ${o.key}: ${THEMES[o.config.theme].label}, ${describeLook(cssLookOf(o.config))}`).join('. ');

/** The CSS fallback: the CSS boxes, side by side, opening together; or the one box. */
function CssCompare({ options, photos, open, onOpen }) {
  if (options.length === 1) {
    const [o] = options;
    return (
      <div className="s3d cmp cmp--css cmp--single">
        <div className="cmp-css-stage">
          <div className="cmp-css-half">
            <GiftBox3D look={cssLookOf(o.config)} items={o.items} photos={photos} state={open ? 'open' : 'closed'} interactive />
          </div>
        </div>
        <div className="s3d-controls cmp-controls">
          <OpenToggle open={open} onOpen={onOpen} />
        </div>
      </div>
    );
  }
  return (
    <div className="s3d cmp cmp--css">
      <div className="cmp-css-stage" role="group" aria-label={describe(options)}>
        {options.map((o) => (
          <div key={o.key} className="cmp-css-half">
            <p className="cmp-label" aria-hidden="true">
              <span className="cmp-letter">{o.key}</span>
              <span className="cmp-caption">{o.caption}</span>
            </p>
            <GiftBox3D look={cssLookOf(o.config)} size="sm" photos={photos} items={o.items} state={open ? 'open' : 'closed'} interactive
              label={`Option ${o.key}: ${describeLook(cssLookOf(o.config))}`} />
          </div>
        ))}
      </div>
      <div className="s3d-controls cmp-controls">
        <OpenToggle open={open} onOpen={onOpen} />
      </div>
    </div>
  );
}

function Stage({ options, photos, open, onOpen, stillsFor, onStills, start, review, onFail }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const dragRef = useRef(null);
  const overlayRefs = useRef(new Map());
  const hintId = useId();
  const [ready, setReady] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [slowNotice, setSlowNotice] = useState(false);
  const [size, setSize] = useState(null);
  const [overlaid, setOverlaid] = useState([[], []]);
  const [refused, setRefused] = useState([[], []]);
  // Read once: changing the setting mid-visit mustn't tear the scene down.
  const [reduced] = useState(() => !review.forceMotion && prefersReducedMotion());

  // Each option's look and gift keep their identity until something in them changes, so the scene redoes only that.
  // There may be one option (Your view) or two (Compare); the count is fixed for the life of the stage.
  const [a, b] = options;
  const single = !b;
  const bConfig = b?.config;
  const bItems = b?.items;
  const lookA = useMemo(() => themeLook(a.config), [a.config]);
  const lookB = useMemo(() => (bConfig ? themeLook(bConfig) : null), [bConfig]);
  const giftA = useMemo(() => giftOf(a.config, a.items, photos), [a.config, a.items, photos]);
  const giftB = useMemo(() => (bConfig ? giftOf(bConfig, bItems, photos) : null), [bConfig, bItems, photos]);
  const first = useRef(null);
  if (!first.current) first.current = single ? [{ look: lookA, gift: giftA }] : [{ look: lookA, gift: giftA }, { look: lookB, gift: giftB }];

  useEffect(() => {
    let cancelled = false;
    let scene = null;
    const host = hostRef.current;
    const started = performance.now();
    const limit = setTimeout(() => {
      cancelled = true;
      onFail();
    }, INIT_LIMIT_MS);
    const notice = setTimeout(() => setSlowNotice(true), SLOW_NOTICE_MS);
    import('./compareScene.js').then(({ createCompareScene }) => {
      if (cancelled) return null;
      const box = host.getBoundingClientRect();
      return createCompareScene(canvasRef.current, {
        width: Math.max(1, box.width),
        height: Math.max(1, box.height),
        options: first.current,
        reducedMotion: reduced,
        quality: start,
        pinQuality: Boolean(review.quality),
        onContextLost: onFail,
        onTooSlow: onFail,
        onPhotos: (index, names) => {
          if (!cancelled) setRefused((r) => r.map((list, i) => (i === index ? names : list)));
        },
        onPhotoOverlays: (index, list) => {
          if (!cancelled) setOverlaid((o) => o.map((items, i) => (i === index ? list : items)));
        },
        onOverlayFrame: (id, matrix, opacity) => {
          const el = overlayRefs.current.get(id);
          if (!el) return;
          el.style.opacity = opacity;
          el.style.visibility = opacity > 0 ? 'visible' : 'hidden';
          if (matrix) el.style.transform = `matrix3d(${matrix.map((v) => v.toFixed(6)).join(',')})`;
        },
      }).then((made) => {
        // A scene that finishes inside one long task can arrive before the timer above gets its turn: the limit still holds.
        const late = performance.now() - started > INIT_LIMIT_MS;
        if (cancelled || made.tooSlow || late) {
          made.dispose();
          if (!cancelled) onFail();
          return;
        }
        clearTimeout(limit);
        clearTimeout(notice);
        scene = made;
        sceneRef.current = made;
        setReady(true);
        if (review.expose) window.__compareScene = made;
      });
    }).catch(() => {
      if (!cancelled) onFail();
    });

    const resized = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize({ width, height });
        sceneRef.current?.resize(width, height);
      }
    });
    resized.observe(host);
    const seen = new IntersectionObserver(([entry]) => sceneRef.current?.setVisible(entry.isIntersecting));
    seen.observe(host);
    const onVisibility = () => sceneRef.current?.setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(limit);
      clearTimeout(notice);
      resized.disconnect();
      seen.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      scene?.dispose();
      sceneRef.current = null;
      setReady(false);
    };
  }, [start, reduced, review, onFail]);

  useEffect(() => {
    if (ready) sceneRef.current?.setOption(0, { look: lookA, gift: giftA });
  }, [ready, lookA, giftA]);
  useEffect(() => {
    if (ready && lookB) sceneRef.current?.setOption(1, { look: lookB, gift: giftB });
  }, [ready, lookB, giftB]);
  useEffect(() => {
    if (ready) sceneRef.current?.setOpen(open);
  }, [ready, open]);
  useEffect(() => {
    sceneRef.current?.setSpin(spinning);
  }, [ready, spinning]);

  // The theme stills, drawn by this same scene once it's ready, so every tile matches the stage exactly.
  const stillLooks = useMemo(() => stillsFor.map(({ key, config }) => ({ key, look: themeLook(config) })), [stillsFor]);
  useEffect(() => {
    if (!ready || !stillLooks.length) return undefined;
    let cancelled = false;
    sceneRef.current?.stills(stillLooks.map((s) => s.look), { w: 320, h: 240 }).then((urls) => {
      if (!cancelled && urls.length) onStills(Object.fromEntries(stillLooks.map((s, i) => [s.key, urls[i]])));
    });
    return () => {
      cancelled = true;
    };
  }, [ready, stillLooks, onStills]);

  const handlers = {
    onPointerDown: (e) => {
      dragRef.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      sceneRef.current?.setDragging(true);
    },
    onPointerMove: (e) => {
      if (!dragRef.current) return;
      sceneRef.current?.turnBy((e.clientX - dragRef.current.x) * 0.45, (e.clientY - dragRef.current.y) * 0.16);
      dragRef.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: () => {
      dragRef.current = null;
      sceneRef.current?.setDragging(false);
    },
    onPointerCancel: () => {
      dragRef.current = null;
      sceneRef.current?.setDragging(false);
    },
    onKeyDown: (e) => {
      const step = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, 4], ArrowDown: [0, -4] }[e.key];
      if (!step) return;
      e.preventDefault();
      sceneRef.current?.turnBy(step[0], step[1]);
    },
  };

  const rects = size ? splitRects(size.width, size.height, options.length) : null;
  const missing = options.flatMap((o, i) => refused[i].map((name) => (single ? name : `${name} (option ${o.key})`)));

  return (
    <div className={`s3d cmp${ready ? ' is-ready' : ''}`}>
      <div className={`s3d-stage cmp-stage${single ? ' cmp-stage--single' : ''}`} ref={hostRef} role="group"
        aria-roledescription={single ? '3D gift box preview' : '3D comparison of two gift boxes'}
        aria-label={single ? describeLook(cssLookOf(a.config)) : describe(options)} aria-describedby={hintId} aria-busy={!ready} tabIndex={0} {...handlers}>
        <canvas ref={canvasRef} aria-hidden="true" />
        {rects && !single && <div className={`cmp-divider${rects[1].x ? '' : ' cmp-divider--rows'}`} aria-hidden="true" />}
        {rects && options.map((o, i) => (
          <div key={o.key} className="cmp-half cmp-photos" style={{ left: rects[i].x, top: rects[i].y, width: rects[i].w, height: rects[i].h }}>
            {overlaid[i].map(({ id, url, aspect }) => (
              <img key={id} className="s3d-photo" src={url} alt="" referrerPolicy="no-referrer" width={256} height={Math.round(256 / aspect)}
                ref={(el) => {
                  if (el) overlayRefs.current.set(id, el);
                  else overlayRefs.current.delete(id);
                }} />
            ))}
          </div>
        ))}
        {!single && <Labels options={options} rects={rects} />}
      </div>
      <p className="sr-only" id={hintId}>{single ? 'Drag the box, or use the arrow keys, to turn it.' : 'Drag the boxes, or use the arrow keys, to turn both of them together.'}</p>
      {!ready && (
        <div className="s3d-preparing">
          <p role="status">{slowNotice ? 'Still preparing the studio. This device is taking a little longer.' : 'Preparing the studio…'}</p>
        </div>
      )}
      <fieldset className="s3d-controls cmp-controls" disabled={!ready} aria-label="Comparison controls">
        <OpenToggle open={open} onOpen={onOpen} />
        <div className="cmp-view">
          {!reduced && (
            <button type="button" className="xp-button" aria-pressed={spinning} onClick={() => setSpinning((on) => !on)}>Turn slowly</button>
          )}
          <button type="button" className="xp-button" onClick={() => {
            setSpinning(false);
            sceneRef.current?.front();
          }}>Front view</button>
        </div>
      </fieldset>
      {missing.length > 0 && open && (
        <p className="s3d-note" role="status">{missing.join(', ')}: this photo couldn’t be loaded for the box, so its name is shown {single ? 'in the list' : 'in the table'} instead.</p>
      )}
    </div>
  );
}

const NO_STILLS = [];
const ignore = () => {};

/**
 * The two options of Compare in the 3D studio, one beside the other (one above the other on a phone), through the same
 * camera and light. Devices that can't run the studio, or that prove too slow, get the CSS boxes instead, with the same
 * open and closed views. `stillsFor` asks for a still of each theme, returned through `onStills` (null without 3D).
 */
export function CompareStage({ options, photos, stillsFor = NO_STILLS, onStills = ignore, initiallyOpen = false }) {
  const [review] = useState(reviewOptions);
  const [start] = useState(() => chooseStart(review));
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(initiallyOpen);
  const onFail = useCallback(() => setFailed(true), []);
  const css = !start || failed;
  useEffect(() => {
    if (css) onStills(null);
  }, [css, onStills]);

  if (css) return <CssCompare options={options} photos={photos} open={open} onOpen={setOpen} />;
  return <Stage options={options} photos={photos} open={open} onOpen={setOpen} stillsFor={stillsFor} onStills={onStills} start={start} review={review} onFail={onFail} />;
}
