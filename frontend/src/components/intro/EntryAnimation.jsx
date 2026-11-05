import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../animations/motion.js';
import { session } from '../../utils/storage.js';

const STORAGE_KEY = 'gg-entry-shown';
/**
 * Its own scroll lock, on <html>: the site's overlays share one on <body> (UiContext), which is set after this mounts
 * and would otherwise undo it.
 */
const LOCK = 'gg-entry-lock';
const unlock = () => document.documentElement.classList.remove(LOCK);
/** How long the opening film may take to be ready before the stills take over. */
const VIDEO_PATIENCE_MS = 2500;

function alreadyShown() {
  // Blocked storage counts as shown: better to skip the intro than to replay it on every page load.
  return !!session.get(STORAGE_KEY, 'blocked');
}

/**
 * The entry follows the site's theme, which `theme-init.js` sets before the page paints: the visitor's own choice if
 * they made one with the header toggle, otherwise the system's light or dark setting.
 */
export const entryTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

/**
 * The film is the Gift Studio's own Royal box, rendered from the studio scene in a room of the site's background for
 * the theme (light teal, or the dark theme's dark teal): a wide framing for screens wider than they're tall, and a
 * tall one for phones held upright. It's always shown whole, between the brand and the button.
 */
export function entryFraming(width, height, theme = 'light') {
  const framing = width / height < 1.2 ? 'tall' : 'wide';
  const name = `${framing}-${theme === 'dark' ? 'dark' : 'light'}`;
  return {
    framing,
    theme: theme === 'dark' ? 'dark' : 'light',
    arrive: `/intro/entry-arrive-${name}.mp4`,
    open: `/intro/entry-open-${name}.mp4`,
    hold: `/intro/entry-hold-${name}.webp`,
    end: `/intro/entry-end-${name}.webp`,
  };
}

/**
 * Reviewing, as in the Gift Studio: in development or a build made for review, `?motion=on` plays the film on a system
 * set to reduced motion. A normal production build ignores it.
 */
const reviewMotion = () => (import.meta.env.DEV || import.meta.env.VITE_STUDIO_REVIEW === '1')
  && new URLSearchParams(window.location.search).get('motion') === 'on';

/** Stills instead of the film: with reduced motion, when the shopper asks to save data, or on a very slow connection. */
export function prefersStills() {
  if (prefersReducedMotion() && !reviewMotion()) return true;
  const connection = typeof navigator !== 'undefined' ? navigator.connection : undefined;
  return Boolean(connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? ''));
}

/** Plays a video, reporting whether it really started. Browsers that refuse to play (or can't) count as failing. */
function play(video) {
  try {
    const result = video?.play();
    return result && typeof result.then === 'function' ? result.then(() => true, () => false) : Promise.resolve(false);
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * The homepage's entry, shown once per browser session: the Gift Studio's Royal box settles in the studio; the
 * shopper opens it (the button, Enter, or a click on the box); the ribbon comes off, the lid opens and a card welcomes
 * them; then it fades into the homepage. `onFinish` is called once, as it starts to fade (or straight away when it
 * isn't shown), so the welcome screen can cross-fade in. With reduced motion, data saving or a film that won't play, it
 * moves between two stills of the same box instead. "Skip intro" or Escape leaves at any time.
 */
export default function EntryAnimation({ onFinish }) {
  const [visible, setVisible] = useState(() => !alreadyShown());
  const [assets] = useState(() => entryFraming(window.innerWidth || 1280, window.innerHeight || 800, entryTheme()));
  const [mode, setMode] = useState(() => (prefersStills() ? 'stills' : 'film'));
  const [phase, setPhase] = useState('arriving'); // arriving → waiting → opening → leaving
  const [heldShown, setHeldShown] = useState(mode === 'stills');
  const arriveRef = useRef(null);
  const openRef = useRef(null);
  const buttonRef = useRef(null);
  const timers = useRef([]);
  const wantsOpen = useRef(false);
  const started = useRef(false);
  const finished = useRef(false);
  const modeRef = useRef(mode);
  const onFinishRef = useRef(onFinish);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinishRef.current?.();
  }, []);

  /** The last moment: fade into the homepage, and hand over to the welcome screen as it starts. */
  const leave = useCallback((fadeMs) => {
    setPhase('leaving');
    session.set(STORAGE_KEY, '1');
    unlock();
    finish();
    later(() => setVisible(false), fadeMs);
  }, [finish]);

  const switchToStills = useCallback(() => {
    if (modeRef.current === 'stills') return;
    modeRef.current = 'stills';
    setMode('stills');
    setHeldShown(true);
  }, []);

  /** The opening, once the box has landed: the film if it can play, otherwise the two stills. */
  const runOpening = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setPhase('opening');
    session.set(STORAGE_KEY, '1');
    if (modeRef.current === 'film') {
      const video = openRef.current;
      const ready = video && video.readyState >= 2 ? true : await new Promise((resolve) => {
        if (!video) { resolve(false); return; }
        const done = (ok) => { video.removeEventListener('canplay', yes); resolve(ok); };
        const yes = () => done(true);
        video.addEventListener('canplay', yes);
        later(() => done(false), VIDEO_PATIENCE_MS);
      });
      if (ready && await play(video)) return; // its end hands over (onEnded)
      switchToStills();
    }
    const quick = prefersReducedMotion();
    later(() => leave(quick ? 300 : 800), quick ? 450 : 1700);
  }, [leave, switchToStills]);

  const openGift = useCallback(() => {
    if (started.current || wantsOpen.current) return;
    wantsOpen.current = true;
    // The box opens once it has landed: straight away if it has, or the moment it does.
    if (phase !== 'arriving' || modeRef.current === 'stills') runOpening();
  }, [phase, runOpening]);

  const skip = useCallback(() => {
    if (finished.current) return;
    started.current = true;
    leave(prefersReducedMotion() ? 200 : 450);
  }, [leave]);

  const landed = useCallback(() => {
    setHeldShown(true);
    setPhase((p) => (p === 'arriving' ? 'waiting' : p));
    if (wantsOpen.current) runOpening();
  }, [runOpening]);

  // Not shown this time (already seen this session): hand over straight away.
  useEffect(() => {
    if (!visible) finish();
  }, [visible, finish]);

  // The arrival: the film plays at once; with stills, the box is simply there. A film that won't start gives way.
  useEffect(() => {
    if (!visible) return undefined;
    if (mode === 'stills') {
      if (phase === 'arriving') landed();
      return undefined;
    }
    let cancelled = false;
    play(arriveRef.current).then((ok) => {
      if (!cancelled && !ok) {
        switchToStills();
        landed();
      }
    });
    const patience = setTimeout(() => {
      if (!cancelled && arriveRef.current && arriveRef.current.readyState < 2) {
        switchToStills();
        landed();
      }
    }, VIDEO_PATIENCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(patience);
    };
    // Started once, when the intro appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // When it appears, and only then: lock scrolling and focus the button. (Leaving releases the lock; it mustn't come back.)
  useEffect(() => {
    if (!visible) return;
    document.documentElement.classList.add(LOCK);
    buttonRef.current?.focus({ preventScroll: true });
  }, [visible]);

  // Enter opens from anywhere, Escape leaves, for as long as it shows.
  const keys = useRef({ openGift, skip });
  useEffect(() => {
    keys.current = { openGift, skip };
  });
  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (e) => {
      if (e.key === 'Enter') keys.current.openGift();
      if (e.key === 'Escape') keys.current.skip();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible]);

  // Leaving the page before the end must not leave scrolling locked.
  useEffect(() => unlock, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!visible) return null;
  const film = mode === 'film';
  return (
    <div className={`gg-entry gg-entry--${assets.theme} is-${phase}${film ? '' : ' gg-entry--stills'}`} role="dialog" aria-modal="true"
      aria-label="GiftGenius intro">
      <div className="gg-entry-stage" aria-hidden="true" onClick={openGift}>
        <img className={`gg-entry-frame${heldShown ? ' is-shown' : ''}`} src={assets.hold} alt="" />
        {film && (
          <video ref={arriveRef} className={`gg-entry-frame gg-entry-arrive${phase === 'opening' ? ' is-gone' : ''}`} src={assets.arrive}
            muted playsInline preload="auto" onEnded={landed} onError={() => { switchToStills(); landed(); }} />
        )}
        {film && (
          <video ref={openRef} className={`gg-entry-frame gg-entry-open${phase === 'opening' || phase === 'leaving' ? ' is-shown' : ''}`}
            src={assets.open} muted playsInline preload="auto" onEnded={() => later(() => leave(800), 450)} onError={switchToStills} />
        )}
        {!film && (
          <img className={`gg-entry-frame gg-entry-end${phase === 'opening' || phase === 'leaving' ? ' is-shown' : ''}`} src={assets.end} alt="" />
        )}
      </div>
      <div className="gg-entry-brand">
        <p>Shubham Creates</p>
        <h2>Gift<em>Genius</em></h2>
      </div>
      <div className="gg-entry-actions">
        <button ref={buttonRef} type="button" className="gg-entry-open-btn" onClick={openGift}>Open your gift</button>
        <p className="gg-entry-hint">Press <strong>Enter</strong> to open your gift</p>
      </div>
      <button type="button" className="gg-entry-skip" onClick={skip}>Skip intro</button>
      <p className="sr-only" aria-live="polite">{phase === 'opening' ? 'The gift opens: a card reads, Welcome to GiftGenius, curated with love.' : ''}</p>
    </div>
  );
}
