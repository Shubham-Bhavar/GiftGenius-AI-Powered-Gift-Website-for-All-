import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../../animations/motion.js';
import { personalisable } from '../StudioControls.jsx';
import { RevealControls } from './RevealControls.jsx';
import { StudioGiftBox } from './StudioGiftBox.jsx';
import { STAGES, useGiftAnimation } from './useGiftAnimation.js';
import { useTurntable } from './useTurntable.js';

/** Confetti: one controlled burst from the opening box, then it's gone. Positions are fixed, so it's never random. */
function Confetti() {
  return (
    <div className="xp-confetti" aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <i key={i} style={{
          '--dx': `${Math.round(Math.cos((i * 137.5 * Math.PI) / 180) * (70 + (i % 5) * 34))}px`,
          '--dy': `${-110 - ((i * 47) % 150)}px`,
          '--spin': `${180 + ((i * 83) % 500)}deg`,
          '--delay': `${(i % 6) * 35}ms`,
        }} />
      ))}
    </div>
  );
}

/** The studio itself, behind the box: a seamless backdrop and two softboxes on stands. */
function StudioBackdrop() {
  return (
    <div className="xp-set" aria-hidden="true">
      <div className="xp-softbox xp-softbox--left"><i /></div>
      <div className="xp-softbox xp-softbox--right"><i /></div>
    </div>
  );
}

/**
 * Plays a reveal experience with the studio's own gift: the real products, name, message and photos, and nothing made
 * up when one is missing. This is the recipient's view, so no prices or budget ever reach it. Photos stay local object
 * URLs. Packaging here is a visual preview, as everywhere in the studio.
 */
export function GiftAnimationPlayer({ experience, config, items, photos, autoPlay = false }) {
  const { key, durations, poses, says, name: title, boxLabel, look, effect, card, needsPhoto } = experience;
  const animation = useGiftAnimation(durations, { autoPlay });
  const { stage, stageName, status, instant, run, play, pause, replay, skip, reset } = animation;
  const dialRef = useRef(null);
  const readoutRef = useRef(null);
  const onAngle = useCallback((degrees) => {
    if (dialRef.current) {
      dialRef.current.value = degrees;
      dialRef.current.setAttribute('aria-valuetext', `${degrees} degrees`);
    }
    if (readoutRef.current) readoutRef.current.textContent = `${degrees}°`;
  }, []);
  const { sceneRef, setPose, hold, turnTo, setSpin, handlers } = useTurntable(poses.idle, onAngle);
  const [spinning, setSpinning] = useState(false);
  const hintId = useId();
  const arrivedRun = useRef(null);
  const reached = stage === null ? '' : STAGES.slice(0, stage + 1).join(' ');
  const showFinal = stageName === 'reveal';

  const name = config.name.trim();
  const message = config.message.trim();
  const printed = config.engraving.trim();
  const printedOn = printed ? items.find(personalisable) : null;
  const giftNames = items.map((p) => p.name).join(' · ');
  const photo = photos[0];
  const heading = card?.heading ? `${card.heading}${name ? `, ${name}` : ''}` : null;
  const showCard = Boolean(card && (heading || message));
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (status === 'paused') {
      hold();
    } else if (stageName === null) {
      setPose(poses.idle, { immediate: true });
    } else {
      // The arrival swings in from its start, once per run: resuming from a pause mustn't jump back there.
      if (stageName === 'entrance' && arrivedRun.current !== run) setPose(poses.start, { immediate: true });
      arrivedRun.current = run;
      setPose(poses[stageName], { immediate: instant });
    }
  }, [stageName, status, instant, run, poses, setPose, hold]);

  useEffect(() => {
    setSpin(spinning);
    return () => setSpin(false);
  }, [spinning, setSpin, stageName, status]);

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

  const said = showFinal
    ? `${heading ? `${heading}. ` : name ? `For ${name}. ` : ''}Inside: ${giftNames}.${message ? ` The card says: ${message}` : ''}`
    : says[stageName] ?? '';

  return (
    <div className={`xp xp-${key}${showCard ? ' has-card' : ''}${status === 'paused' ? ' is-paused' : ''}${instant ? ' is-instant' : ''}`} data-reached={reached} data-status={status}>
      <div className="xp-stage">
        <StudioBackdrop />
        <div className="xp-viewport" role="group" aria-roledescription="3D gift box preview" aria-label={`${title}: ${boxLabel}`}
          aria-describedby={hintId} tabIndex={0} {...handlers}>
          <div className="xp-scene" ref={sceneRef} aria-hidden="true">
            <StudioGiftBox key={run} items={items} name={name} photo={photo} look={look} />
          </div>
        </div>
        <p className="sr-only" id={hintId}>Drag the box, or use the arrow keys, to turn it all the way round.</p>
        {effect === 'confetti' && (stageName === 'lid' || stageName === 'reveal') && !instant && !reduced && <Confetti key={run} />}
        {showFinal && <div className="xp-dim" aria-hidden="true" />}
        {showFinal && (
          <div className="xp-caption">
            {photo && !look.photoPrints && <img className="xp-caption-photo" src={photo} alt="Your photo" />}
            {photo && look.photoPrints && <img className="xp-caption-print" src={photo} alt="Your photo" />}
            {showCard ? (
              <div className="xp-card">
                {heading && <p className="xp-card-heading">{heading}</p>}
                {!heading && name && <p className="xp-caption-for">For {name}</p>}
                {message && <p className="xp-caption-message">{message}</p>}
              </div>
            ) : (
              <>
                {name && <p className="xp-caption-for">For {name}</p>}
              </>
            )}
            <p className="xp-caption-gift">{giftNames}</p>
            {!showCard && message && <p className="xp-caption-message">{message}</p>}
            {printedOn && <p className="xp-caption-printed">Printed “{printed}” on the {printedOn.name}</p>}
          </div>
        )}
      </div>
      <RevealControls animation={controls} spinning={spinning} canSpin={!reduced} onToggleSpin={toggleSpin}
        dialRef={dialRef} readoutRef={readoutRef} onDial={turnTo} />
      <p className="sr-only" aria-live="polite">{said}</p>
      {needsPhoto && !photo && <p className="studio-hint">This experience is made for your photo: add one under Personal touches to see it here. Nothing is shown in its place.</p>}
      <p className="studio-note">A digital preview of the moment. Real wrapping and packaging may differ, and packaging isn’t added to your order.</p>
    </div>
  );
}
