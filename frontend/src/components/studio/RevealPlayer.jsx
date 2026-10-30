import { useEffect, useMemo, useState } from 'react';
import { prefersReducedMotion } from '../../animations/motion.js';
import { GiftBox3D } from './GiftBox3D.jsx';
import { MessageCard } from './MessageCard.jsx';

/** The screens of a reveal, in the template's order with the card and the gift in the order the shopper chose. */
export function revealSteps(template, order) {
  const cardAndGift = order === 'gift-first' ? ['gift', 'card'] : ['card', 'gift'];
  if (template === 'surprise') return ['box', 'untie', 'open', ...cardAndGift, 'finale'];
  if (template === 'sentimental') return ['intro', 'card', 'box', 'untie', 'open', 'gift', 'finale'];
  return ['intro', 'box', 'untie', 'open', ...cardAndGift, 'finale'];
}

const GREETING = {
  birthday: 'Happy birthday', anniversary: 'Happy anniversary', festival: 'Happy festivities',
  valentine: 'Happy Valentine’s Day', graduation: 'Congratulations', achievement: 'Congratulations',
};

/** The action that moves on from each screen, named after what comes next. */
function actionLabel(step, nextStep) {
  if (step === 'intro') return 'Open your gift';
  if (step === 'box') return 'Pull the ribbon';
  if (step === 'untie') return 'Lift the lid';
  if (step === 'finale') return '↺ Watch again';
  return { card: 'Read the card', gift: 'See the gift', box: 'Open the box', finale: 'Finish' }[nextStep];
}

/**
 * The recipient's view: the unboxing, screen by screen, the way they would experience it. Shoppers click through
 * (or click the box) or let it play. No prices are shown here. A digital preview only: it promises nothing about the
 * actual delivery or packaging.
 */
export function RevealPlayer({ config, look, items, photos, occasion }) {
  const steps = useMemo(() => revealSteps(config.template, config.order), [config.template, config.order]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const step = steps[index];
  const reached = (s) => steps.includes(s) && index >= steps.indexOf(s);
  const boxState = reached('open') ? 'open' : reached('untie') ? 'untied' : 'closed';
  const name = config.name.trim();
  const greeting = `${GREETING[occasion] ?? 'Enjoy your gift'}${name ? `, ${name}` : ''}!`;
  const confetti = step === 'finale' && (config.template === 'surprise' || config.theme === 'celebration') && !prefersReducedMotion();

  const advance = () => setIndex((i) => (i + 1 < steps.length ? i + 1 : 0));
  useEffect(() => {
    if (!playing || index === steps.length - 1) return undefined;
    const t = setTimeout(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), prefersReducedMotion() ? 900 : 1700);
    return () => clearTimeout(t);
  }, [playing, index, steps.length]);

  const said = {
    intro: `A gift for ${name || 'you'}.`,
    box: 'A wrapped gift box.',
    untie: 'The ribbon is untied.',
    open: 'The lid is open.',
    card: `The card says: ${config.message.trim() || 'your message'}`,
    gift: `Inside: ${items.map((p) => p.name).join(', ')}.`,
    finale: greeting,
  }[step];

  return (
    <div className={`unbox unbox--${step}`}>
      <div className="unbox-stage">
        {step === 'intro' ? (
          <div className="unbox-intro">
            <span>A gift for</span>
            <strong>{name || 'you'}</strong>
          </div>
        ) : (
          // Clicking the box moves on too; the button below does the same for keyboards and screen readers.
          <div className="unbox-box" onClick={step === 'box' || step === 'untie' ? advance : undefined}>
            <GiftBox3D look={look} items={reached('gift') ? items : []} photos={photos} state={boxState}
              label={`${said} ${reached('gift') ? '' : 'Still a surprise.'}`.trim()} />
          </div>
        )}
        {reached('card') && step !== 'intro' && (
          <div className={`unbox-card${step === 'card' ? ' is-current' : ''}`}>
            <MessageCard style={config.card} name={config.name} message={config.message} photos={photos} compact={step !== 'card'} />
          </div>
        )}
        {reached('gift') && <p className="unbox-gift-names">{items.map((p) => p.name).join(' · ')}</p>}
        {step === 'finale' && <p className="unbox-greeting">{greeting}</p>}
        {confetti && (
          <div className="unbox-confetti" aria-hidden="true">
            {/* Spread across the stage and staggered, in an order that looks scattered rather than left to right. */}
            {Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--x': `${((i * 37) % 97) + 1}%`, '--d': `${((i * 7) % 18) * 70}ms` }} />)}
          </div>
        )}
      </div>

      <div className="unbox-controls">
        <span className="unbox-progress">Step {index + 1} of {steps.length}</span>
        <button type="button" className="btn-primary unbox-next" onClick={() => {
          if (step === 'finale') {
            setPlaying(false);
            setIndex(0);
          } else {
            advance();
          }
        }}>{actionLabel(step, steps[index + 1])}</button>
        {step !== 'finale' && (
          <button type="button" className="unbox-play" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>
            {playing ? '⏸ Pause' : '▶ Play it for me'}
          </button>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{said}</p>
      <p className="studio-note">A digital preview of the moment. Real wrapping and packaging may differ.</p>
    </div>
  );
}
