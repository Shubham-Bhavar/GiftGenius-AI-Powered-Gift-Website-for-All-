import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../../animations/motion.js';
import SafeImg from '../../common/SafeImg.jsx';
import { GiftAnimationPlayer } from '../experiences/GiftAnimationPlayer.jsx';
import { RevealControls } from '../experiences/RevealControls.jsx';
import { useGiftAnimation } from '../experiences/useGiftAnimation.js';
import { personalisable } from '../StudioControls.jsx';
import { LOOKS, posterFor } from './looks.js';
import { deviceHints, measureCpu, probeDevice, QUALITY, startingQuality } from './quality.js';
import '../../../styles/studio/studio-room.css';

/** If the studio still isn't ready after this long, the CSS player takes over. */
export const INIT_LIMIT_MS = 30000;
/** After this long, the waiting message says so. */
export const SLOW_NOTICE_MS = 7000;

/**
 * Reviewing the studio, in development or a build made for review: `motion=on` overrules a system set to reduced motion,
 * `quality=` pins a level, and `webgl=off` shows the CSS fallback. A normal production build ignores all three.
 */
export function reviewOptions() {
  if (!(import.meta.env.DEV || import.meta.env.VITE_STUDIO_REVIEW === '1')) return {};
  const search = new URLSearchParams(window.location.search);
  return { forceMotion: search.get('motion') === 'on', quality: search.get('quality'), webglOff: search.get('webgl') === 'off', expose: true };
}

/** Whether this device should run the 3D studio at all, and at what quality. Decided before any 3D code is downloaded. */
export function chooseStart({ quality, webglOff }) {
  if (webglOff) return null;
  const device = probeDevice();
  if (!device.webgl) return null;
  if (QUALITY[quality]) return quality;
  if (!startingQuality(device, deviceHints())) return null; // no need to time a device already ruled out
  return startingQuality(device, { ...deviceHints(), cpuMs: measureCpu() });
}

/** What the scene needs to know about the gift: only what the shopper gave, and never a price or a budget. */
function giftFor(experience, config, items, photos) {
  const name = config.name.trim();
  const message = config.message.trim();
  const heading = experience.card?.heading ? `${experience.card.heading}${name ? `, ${name}` : ''}` : name && `For ${name}`;
  return { items: items.map(({ id, name: productName, image }) => ({ id, name: productName, image })), heading, message, photos };
}

function Stage({ experience, config, items, photos, autoPlay, run: previewRun, start, review, recipient, onFail }) {
  const { key } = experience;
  const look = LOOKS[key];
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const dialRef = useRef(null);
  const readoutRef = useRef(null);
  const dragRef = useRef(null);
  const startedRef = useRef('');
  const firstLook = useRef(key);
  const firstGift = useRef(null);
  const hintId = useId();
  const [ready, setReady] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [refused, setRefused] = useState([]);
  const [overlaid, setOverlaid] = useState([]);
  const [playWhenReady, setPlayWhenReady] = useState(false);
  const [slowNotice, setSlowNotice] = useState(false);
  const overlayRefs = useRef(new Map());
  const wantsPlay = useRef(false);
  // The scene is built once, for the setting it found: changing it mid-visit mustn't tear the scene down.
  const [reduced] = useState(() => !review.forceMotion && prefersReducedMotion());
  const animation = useGiftAnimation(look.durations, { autoPlay: false });
  const { stageName, status, instant, run, play, pause, replay, skip, reset } = animation;

  const gift = useMemo(() => giftFor(experience, config, items, photos), [experience, config, items, photos]);
  if (!firstGift.current) firstGift.current = gift;

  const onAngle = useCallback((degrees) => {
    if (dialRef.current) {
      dialRef.current.value = degrees;
      dialRef.current.setAttribute('aria-valuetext', `${degrees} degrees`);
    }
    if (readoutRef.current) readoutRef.current.textContent = `${degrees}°`;
  }, []);

  // The scene: downloaded, built and measured once, while a still of the same box stands in.
  useEffect(() => {
    let cancelled = false;
    let scene = null;
    const host = hostRef.current;
    const started = performance.now();
    const fail = () => onFail(wantsPlay.current);
    // However slow the device, the shopper isn't left waiting: past this point the CSS player takes over.
    const limit = setTimeout(() => {
      cancelled = true;
      fail();
    }, INIT_LIMIT_MS);
    const notice = setTimeout(() => setSlowNotice(true), SLOW_NOTICE_MS);
    import('./studioScene.js').then(({ createStudioScene }) => {
      if (cancelled) return null;
      const loaded = performance.now();
      const { width, height } = host.getBoundingClientRect();
      return createStudioScene(canvasRef.current, {
        width: Math.max(1, width),
        height: Math.max(1, height),
        lookKey: firstLook.current,
        gift: firstGift.current,
        reducedMotion: reduced,
        quality: start,
        pinQuality: Boolean(QUALITY[review.quality]),
        onAngle,
        onContextLost: fail,
        onTooSlow: fail,
        onPhotos: (names) => {
          if (!cancelled) setRefused(names);
        },
        onPhotoOverlays: (list) => {
          if (!cancelled) setOverlaid(list);
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
          if (!cancelled) fail();
          return;
        }
        clearTimeout(limit);
        clearTimeout(notice);
        scene = made;
        sceneRef.current = made;
        setReady(true);
        if (review.expose) {
          window.__giftScene = made;
          window.__giftSceneTimes = { downloadMs: Math.round(loaded - started), readyMs: Math.round(performance.now() - started) };
        }
      });
    }).catch(() => {
      if (!cancelled) fail();
    });

    const resized = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) sceneRef.current?.resize(width, height);
    });
    resized.observe(host);
    // Nothing is drawn while the stage is scrolled away or the tab is hidden.
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
    };
  }, [start, reduced, review, onAngle, onFail]);

  // A new look or a preview starts again from the top, on the same box.
  const lookApplied = useRef(key);
  useEffect(() => {
    if (!ready) return;
    if (lookApplied.current !== key) {
      lookApplied.current = key;
      sceneRef.current?.setLook(key);
    }
    setSpinning(false);
    startedRef.current = '';
    const wanted = wantsPlay.current;
    wantsPlay.current = false;
    if (autoPlay || wanted) replay();
    else reset();
  }, [ready, key, previewRun, autoPlay, replay, reset]);

  // The gift, as the shopper changes it.
  useEffect(() => {
    if (!ready || gift === firstGift.current) return undefined;
    sceneRef.current?.setGift(gift);
    return undefined;
  }, [ready, gift]);

  // The state machine leads, and the scene follows it, stage by stage.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    const id = `${run}:${stageName}`;
    if (stageName === null) {
      if (startedRef.current !== id) scene.showIdle();
    } else if (instant) {
      if (startedRef.current !== id) scene.showFinished();
    } else if (startedRef.current !== id) {
      scene.play(stageName, look.durations[stageName]);
    }
    startedRef.current = id;
    scene.setPaused(status === 'paused');
  }, [ready, stageName, status, instant, run, look]);

  useEffect(() => {
    sceneRef.current?.setSpin(spinning);
  }, [spinning, ready]);

  // The sequence and the turntable don't run together: starting one stops the other.
  const stopping = (action) => () => {
    setSpinning(false);
    action();
  };
  const controls = { ...animation, play: stopping(play), replay: stopping(replay), skip: stopping(skip), reset: stopping(reset) };
  const toggleSpin = () => {
    if (status === 'playing') pause();
    setSpinning((on) => !on);
  };

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

  const finished = status === 'finished';
  const showFinal = finished || stageName === 'reveal';
  const message = config.message.trim();
  const printed = config.engraving.trim();
  const printedOn = printed ? items.find(personalisable) : null;
  const giftNames = items.map((p) => p.name).join(' · ');
  const said = showFinal
    ? `${gift.heading ? `${gift.heading}. ` : ''}Inside: ${giftNames}.${message ? ` The card says: ${message}` : ''}`
    : experience.says[stageName] ?? '';

  return (
    <div className={`s3d${ready ? ' is-ready' : ''}`} data-status={status} data-stage={stageName ?? 'idle'}>
      <div className="s3d-stage" ref={hostRef} role="group" aria-roledescription="3D gift box preview"
        aria-label={`${experience.name}: ${experience.boxLabel}`} aria-describedby={hintId} aria-busy={!ready} tabIndex={0} {...handlers}>
        <img className="s3d-poster" src={posterFor(key)} alt="" />
        <canvas ref={canvasRef} aria-hidden="true" />
        {overlaid.map(({ id, url, aspect }) => (
          <img key={id} className="s3d-photo" src={url} alt="" referrerPolicy="no-referrer" width={256} height={Math.round(256 / aspect)}
            ref={(el) => {
              if (el) overlayRefs.current.set(id, el);
              else overlayRefs.current.delete(id);
            }} />
        ))}
      </div>
      <p className="sr-only" id={hintId}>Drag the box, or use the arrow keys, to turn it all the way round.</p>
      {!ready && (
        <div className="s3d-preparing">
          <p role="status">
            {slowNotice ? 'Still preparing the studio. This device is taking a little longer.' : 'Preparing the studio…'}
            {playWhenReady && ' It will play as soon as it’s ready.'}
          </p>
          <button type="button" className="xp-button" aria-pressed={playWhenReady} onClick={() => {
            wantsPlay.current = !playWhenReady;
            setPlayWhenReady(!playWhenReady);
          }}>{playWhenReady ? 'Don’t play yet' : 'Play when ready'}</button>
        </div>
      )}
      <fieldset className="s3d-controls" disabled={!ready} aria-label="Reveal and turntable controls">
        <RevealControls animation={controls} spinning={spinning} canSpin={!reduced} onToggleSpin={toggleSpin}
          dialRef={dialRef} readoutRef={readoutRef} onDial={(degrees) => sceneRef.current?.turnTo(degrees)} />
      </fieldset>
      <p className="sr-only" aria-live="polite">{said}</p>
      {showFinal && (
        <div className="s3d-card">
          {gift.heading && <p className="s3d-card-heading">{gift.heading}</p>}
          {message && <p className="s3d-card-message">{message}</p>}
          {items.length > 1 && <p className="s3d-card-count">{items.length} gifts in this box</p>}
          <ul className="s3d-card-gifts">
            {items.map((p) => (
              <li key={p.id}><SafeImg src={p.image} alt="" /><span>{p.name}</span></li>
            ))}
          </ul>
          {printedOn && <p className="s3d-card-printed">Printed “{printed}” on the {printedOn.name}</p>}
        </div>
      )}
      {refused.length > 0 && showFinal && (
        <p className="s3d-note" role="status">{refused.join(', ')}: this photo couldn’t be loaded for the box, so its name is shown here instead.</p>
      )}
      {experience.needsPhoto && photos.length === 0 && !recipient && (
        <p className="s3d-note">This experience is made for your photo: add one under Personal touches to see it here. Nothing is shown in its place.</p>
      )}
      <p className="s3d-note">A digital preview of the moment. Real wrapping and packaging may differ, and packaging isn’t added to your order.</p>
    </div>
  );
}

/**
 * The reveal in the 3D studio. Everything about the 3D is in a separate download, fetched only for a device that can
 * really use it. Any other device, or one that proves too slow or loses its GPU, gets the CSS player instead, with the
 * same gift and the same words.
 */
export function StudioStage3D({ experience, config, items, photos, autoPlay = false, run = 0, recipient = false }) {
  const [review] = useState(reviewOptions);
  const [start] = useState(() => chooseStart(review));
  const [failed, setFailed] = useState(false);
  const [playAfterFailing, setPlayAfterFailing] = useState(false);
  const onFail = useCallback((wantedPlay = false) => {
    setPlayAfterFailing(Boolean(wantedPlay));
    setFailed(true);
  }, []);

  if (!start || failed) {
    return (
      <GiftAnimationPlayer key={`${experience.key}-${run}-${config.products.join('-')}`} experience={experience}
        config={config} items={items} photos={photos} autoPlay={autoPlay || playAfterFailing} recipient={recipient} />
    );
  }
  return <Stage experience={experience} config={config} items={items} photos={photos} autoPlay={autoPlay} run={run} start={start} review={review} recipient={recipient} onFail={onFail} />;
}
