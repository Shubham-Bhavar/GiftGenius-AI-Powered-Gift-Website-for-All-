import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'gg-entry-shown';
const CONFETTI_COLORS = ['#D4AF37', '#6EC6CF', '#FFA726', '#fff', '#4FB3BF', '#FFD700', '#a8f0f5', '#ffd93d', '#B8791A'];
const FIREWORK_POSITIONS = [{ x: 20, y: 25 }, { x: 80, y: 20 }, { x: 15, y: 70 }, { x: 85, y: 65 }, { x: 50, y: 15 }, { x: 50, y: 80 }];

function alreadyShown() {
  try {
    return !!sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return true;
  }
}

function makeConfetti() {
  return Array.from({ length: 80 }, (_, i) => {
    const size = () => `${Math.random() * 10 + 5}px`;
    return {
      id: i,
      style: {
        left: `${Math.random() * 100}%`,
        background: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        width: size(),
        height: size(),
        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
        animationDuration: `${Math.random() * 2 + 2}s`,
        animationDelay: `${Math.random() * 1.5}s`,
        transform: `rotate(${Math.random() * 360}deg)`,
      },
    };
  });
}

/** The homepage's gift-box entry animation: shown once per browser session. */
export default function EntryAnimation() {
  const [visible, setVisible] = useState(() => !alreadyShown());
  const [opening, setOpening] = useState(false);
  const [popped, setPopped] = useState(false);
  const [brand, setBrand] = useState(false);
  const [fading, setFading] = useState(false);
  const [confetti, setConfetti] = useState([]);
  const [fireworks, setFireworks] = useState([]);
  const timers = useRef([]);
  const started = useRef(false);

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const openGift = useCallback(() => {
    if (started.current) return;
    started.current = true;
    document.body.style.overflow = '';
    setOpening(true);
    setConfetti(makeConfetti());
    later(() => setPopped(true), 550);
    later(() => {
      setBrand(true);
      FIREWORK_POSITIONS.forEach((pos, i) => {
        later(() => {
          const size = Math.random() * 120 + 80;
          const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
          const burst = {
            id: i,
            style: {
              left: `${pos.x}%`, top: `${pos.y}%`, width: size, height: size, margin: -size / 2,
              border: `3px solid ${color}`, boxShadow: `0 0 20px ${color}`, animationDuration: '0.9s', animationDelay: '0s',
            },
          };
          setFireworks((f) => [...f, burst]);
          later(() => setFireworks((f) => f.filter((b) => b.id !== i)), 1000);
        }, i * 250);
      });
    }, 1000);
    later(() => {
      setFading(true);
      later(() => setVisible(false), 950);
    }, 3400);
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    document.body.style.overflow = 'hidden';
    const onEnter = (e) => { if (e.key === 'Enter') openGift(); };
    document.addEventListener('keydown', onEnter);
    return () => {
      document.removeEventListener('keydown', onEnter);
      document.body.style.overflow = '';
    };
    // Only on mount: once opened, the overlay unmounts itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!visible) return null;
  return (
    <div id="entryOverlay" className={fading ? 'fade-out' : ''}>
      <div className="confetti-container">
        {confetti.map((c) => <div key={c.id} className="confetti-piece" style={c.style} />)}
      </div>
      <div className="firework-container">
        {fireworks.map((f) => <div key={f.id} className="firework-burst" style={f.style} />)}
      </div>
      <p className="entry-hint">Press <strong>Enter</strong> to open your gift ✨</p>
      <div className="entry-scene-wrap">
        <div className={`cartoon-popup ${popped ? 'popped' : ''}`}>
          <div className="cartoon-avatar-wrap">
            <img src="/mascot.jpg" alt="GiftGenius penguin mascot - Hi!" className="cartoon-avatar" />
            <div className="cartoon-glow" />
          </div>
          <div className="hi-bubble">
            <span>Your Gift Awaits! 🎁</span>
            <div className="hi-tail" />
          </div>
        </div>
        <div className={`gift-box-scene ${opening ? 'opening' : ''}`} role="button" tabIndex={0}
          aria-label="Open the gift to enter GiftGenius" onClick={openGift}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); openGift(); } }}>
          <div className="gift-box-bow">🎀</div>
          <div className="gift-box-lid" />
          <div className="gift-box-base" />
        </div>
      </div>
      <div className={`entry-brand ${brand ? 'visible' : ''}`}>
        <p>✨ Shubham Creates</p>
        <h2>Gift<em>Genius</em></h2>
      </div>
    </div>
  );
}
