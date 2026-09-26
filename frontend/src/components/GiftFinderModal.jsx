import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import SafeImg from './SafeImg.jsx';
import { api } from '../lib/api.js';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { useRestoreFocus } from '../hooks/useRestoreFocus.js';
import { trapFocus } from '../lib/focus.js';

const TOTAL_STEPS = 4;
const RECIPIENTS = [
  { value: 'friend', icon: '👭', label: 'Friend' },
  { value: 'partner', icon: '❤️', label: 'Partner' },
  { value: 'parent', icon: '👨‍👩‍👧', label: 'Parent' },
  { value: 'sibling', icon: '🧑‍🤝‍🧑', label: 'Sibling' },
  { value: 'colleague', icon: '💼', label: 'Colleague' },
  { value: 'self', icon: '✨', label: 'Myself' },
];
const OCCASIONS = [
  { value: 'birthday', icon: '🎂', label: 'Birthday' },
  { value: 'anniversary', icon: '💕', label: 'Anniversary' },
  { value: 'festival', icon: '🪔', label: 'Festival' },
  { value: 'graduation', icon: '🎓', label: 'Graduation' },
  { value: 'valentine', icon: '❤️', label: "Valentine's Day" },
];
const INTERESTS = [
  { value: 'flowers', icon: '🌸', label: 'Flowers' },
  { value: 'fragrance', icon: '🌺', label: 'Fragrance' },
  { value: 'accessories', icon: '⌚', label: 'Accessories' },
  { value: 'gift sets', icon: '🎁', label: 'Gift Sets' },
  { value: 'personalized', icon: '✍️', label: 'Personalized' },
  { value: 'food & sweets', icon: '🍫', label: 'Food & Sweets' },
  { value: 'wellness', icon: '🧘', label: 'Wellness' },
  { value: 'home decor', icon: '🏡', label: 'Home Decor' },
  { value: 'cultural', icon: '🎨', label: 'Cultural' },
];
const BUDGET_MIN = 500;
const BUDGET_MAX = 5000;
const BUDGET_STEP = 100;
const PROGRESS_LABELS = { 1: 'Understanding them', 2: 'Understanding the occasion', 3: 'Understanding your budget', 4: 'Almost ready' };
const MIN_THINKING_MS = 1100; // the original "thinking" beat, kept even when the AI answers faster

function Identity() {
  return (
    <div className="gf-identity">
      <div className="gf-identity-name"><span className="sparkle">✨</span> GIFTGENIUS AI</div>
      <p className="gf-identity-role">Your personal gift consultant</p>
    </div>
  );
}

function Progress({ step }) {
  const pct = (step / TOTAL_STEPS) * 100;
  const fill = useRef(null);
  const last = useRef(0);
  // Animate from the previous step's width (double rAF so the CSS transition runs).
  useLayoutEffect(() => {
    const el = fill.current;
    if (!el) return undefined;
    el.style.width = `${last.current}%`;
    let r2;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        el.style.width = `${pct}%`;
        last.current = pct;
      });
    });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [pct]);
  return (
    <>
      <div className="gf-progress-track"><div className="gf-progress-fill" ref={fill} /></div>
      <div className="gf-progress-label"><span>{PROGRESS_LABELS[step]}</span><span className="gf-progress-pct">{pct}%</span></div>
    </>
  );
}

function Options({ items, isSelected, onPick, label, interests }) {
  return (
    <div className={`gf-options ${interests ? 'gf-options--interests' : ''}`} role="group" aria-label={label}>
      {items.map((o) => (
        <button key={o.value} type="button" className={`gf-option ${isSelected(o.value) ? 'selected' : ''}`}
          aria-pressed={isSelected(o.value)} onClick={() => onPick(o.value)}>
          <span className="gf-option-icon" aria-hidden="true">{o.icon}</span>
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function ResultCard({ pick }) {
  const cart = useCart();
  const toast = useToast();
  const [added, setAdded] = useState(false);
  const p = pick.product;
  const discount = Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100);
  return (
    <div className="gf-result-card">
      <div className="gf-result-img-wrap">
        <SafeImg src={p.image} alt={p.alt || p.name} loading="lazy" className="gf-result-img" />
        {discount > 0 && <span className="gf-result-badge">{discount}% off</span>}
      </div>
      <div className="gf-result-body">
        <p className="gf-result-cat">{p.category}</p>
        <h3 className="gf-result-name"><Link to={`/product/${p.id}`}>{p.name}</Link></h3>
        <p className="gf-result-desc">{p.description}</p>
        <div className="gf-result-reason">✨ {pick.reason}</div>
        <div className="gf-result-foot">
          <div className="gf-result-price">
            {discount > 0 && <span className="gf-result-og">₹{Number(p.originalPrice).toLocaleString('en-IN')}</span>}
            <span className="gf-result-now">₹{Number(p.price).toLocaleString('en-IN')}</span>
          </div>
          <button type="button" className="gf-result-add" disabled={added} onClick={async () => {
            try {
              await cart.add(p, 1);
              setAdded(true);
              toast(`${p.name} added to cart! 🛒`);
            } catch (err) {
              toast(err.message, 'bad');
            }
          }}>{added ? '✓ Added' : '+ Add'}</button>
        </div>
      </div>
    </div>
  );
}

/** The homepage's 4-step Gift Finder modal, now answered by the AI recommendation API. */
export default function GiftFinderModal() {
  const { giftFinderOpen: open, closeGiftFinder } = useUi();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [phase, setPhase] = useState('form'); // form | thinking | results | error
  const [state, setState] = useState({ recipient: null, occasion: null, budget: 1500, interests: [] });
  const [result, setResult] = useState(null);
  const content = useRef(null);
  const closeBtn = useRef(null);
  const run = useRef(0);

  useRestoreFocus(open);
  // Reopening starts at step 1 but keeps earlier answers, like the original.
  useEffect(() => {
    if (open) {
      setStep(1);
      setPhase('form');
      closeBtn.current?.focus();
    } else {
      run.current++; // cancel an in-flight request's rendering
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeGiftFinder(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeGiftFinder]);

  // Move focus to the new heading after each step so screen readers announce it.
  useEffect(() => {
    if (!open) return;
    const h = content.current?.querySelector(phase === 'results' ? '.gf-results-title' : '.gf-title');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }, [open, step, phase]);

  const pick = (field) => (value) => setState((s) => {
    if (field === 'interests') {
      const has = s.interests.includes(value);
      return { ...s, interests: has ? s.interests.filter((x) => x !== value) : [...s.interests, value] };
    }
    return { ...s, [field]: value };
  });

  const next = () => {
    if (step === 2 && !state.occasion) { toast('Choose an occasion first.', 'bad'); return; }
    setStep((s) => s + 1);
  };

  const submit = async () => {
    if (phase !== 'form') return;
    if (!state.occasion) { toast('Choose an occasion first.', 'bad'); return; }
    const id = ++run.current;
    setPhase('thinking');
    const started = Date.now();
    try {
      const res = await api.recommend({
        recipient: state.recipient === 'self' ? undefined : state.recipient || undefined,
        occasion: state.occasion, budget: state.budget, interests: state.interests, limit: 4,
      });
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_THINKING_MS - (Date.now() - started))));
      if (id !== run.current) return;
      setResult(res);
      setPhase('results');
    } catch (err) {
      if (id !== run.current) return;
      toast(err.message, 'bad');
      setPhase('form');
    }
  };

  const recipientLabel = RECIPIENTS.find((r) => r.value === state.recipient)?.label ?? 'them';
  const occasionLabel = OCCASIONS.find((o) => o.value === state.occasion)?.label ?? 'this occasion';
  const budget = `₹${state.budget.toLocaleString('en-IN')}`;

  return (
    <>
      <div className={`modal-overlay gf-overlay ${open ? 'open' : ''}`} aria-hidden={!open} onClick={closeGiftFinder} />
      <div className={`quickview-modal gf-modal ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="GiftGenius Gift Finder"
        aria-hidden={!open} inert={!open} onKeyDown={trapFocus}>
        <button type="button" className="modal-close" aria-label="Close gift finder" ref={closeBtn} onClick={closeGiftFinder}>✕</button>
        <div className="gf-content" ref={content}>
          {open && phase === 'form' && (
            <>
              <Identity />
              <Progress step={step} />
              <div className="gf-step">
                {step === 1 && (
                  <>
                    <p className="gf-lead">Let&apos;s find something they&apos;ll genuinely love.</p>
                    <h2 className="gf-title">Who are you shopping for?</h2>
                    <Options items={RECIPIENTS} label="Select recipient" isSelected={(v) => state.recipient === v} onPick={pick('recipient')} />
                    <p className="gf-microcopy">This helps me understand who the gift is really for.</p>
                    <div className="gf-nav"><button type="button" className="gf-btn-continue" onClick={next}>Continue →</button></div>
                  </>
                )}
                {step === 2 && (
                  <>
                    <p className="gf-lead">Perfect. What are we celebrating?</p>
                    <h2 className="gf-title">What&apos;s the occasion?</h2>
                    <Options items={OCCASIONS} label="Select occasion" isSelected={(v) => state.occasion === v} onPick={pick('occasion')} />
                    <p className="gf-microcopy">The occasion helps me narrow down the right kind of gift.</p>
                    <div className="gf-nav">
                      <button type="button" className="gf-btn-back" onClick={() => setStep(1)}>← Back</button>
                      <button type="button" className="gf-btn-continue" disabled={!state.occasion} onClick={next}>Continue →</button>
                    </div>
                  </>
                )}
                {step === 3 && (
                  <>
                    <h2 className="gf-title">What&apos;s your comfortable gift budget?</h2>
                    <div className="gf-budget-display">{budget}</div>
                    <input type="range" className="gf-slider" min={BUDGET_MIN} max={BUDGET_MAX} step={BUDGET_STEP} value={state.budget}
                      aria-label="Gift budget in rupees" aria-valuetext={budget}
                      onChange={(e) => setState((s) => ({ ...s, budget: Number(e.target.value) }))} />
                    <div className="gf-slider-range"><span>₹{BUDGET_MIN.toLocaleString('en-IN')}</span><span>₹{BUDGET_MAX.toLocaleString('en-IN')}</span></div>
                    <p className="gf-microcopy">I&apos;ll keep suggestions within this range.</p>
                    <div className="gf-nav">
                      <button type="button" className="gf-btn-back" onClick={() => setStep(2)}>← Back</button>
                      <button type="button" className="gf-btn-continue" onClick={next}>Continue →</button>
                    </div>
                  </>
                )}
                {step === 4 && (
                  <>
                    <p className="gf-lead">Nice. What kind of things would suit them?</p>
                    <h2 className="gf-title">Pick anything that feels like them.</h2>
                    <Options interests items={INTERESTS} label="Select interests" isSelected={(v) => state.interests.includes(v)} onPick={pick('interests')} />
                    <p className="gf-microcopy">Choose as many as you like — I&apos;ll use these to personalise the results.</p>
                    <div className="gf-nav">
                      <button type="button" className="gf-btn-back" onClick={() => setStep(3)}>← Back</button>
                      <button type="button" className="gf-btn-continue" onClick={submit}>✨ Build My Gift Profile</button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {open && phase === 'thinking' && (
            <div className="gf-thinking">
              <div className="gf-identity-name" style={{ justifyContent: 'center' }}><span className="sparkle">✨</span> GIFTGENIUS AI</div>
              <p className="gf-thinking-text">Understanding your gift profile…</p>
              <div className="gf-checklist">
                {['Recipient', 'Occasion', 'Budget', 'Interests'].map((label) => (
                  <div className="gf-checklist-item" key={label}><span>{label}</span><span className="gf-checklist-check">✓</span></div>
                ))}
              </div>
            </div>
          )}

          {open && phase === 'results' && result && (
            <div className="gf-results">
              <div className="gf-results-header">
                <div className="gf-identity-name" style={{ justifyContent: 'center' }}><span className="sparkle">✨</span> GIFTGENIUS AI</div>
                <h2 className="gf-results-title">Your top picks are ready</h2>
                <p className="gf-results-sub">
                  {result.picks.length} gifts matched for your <strong>{recipientLabel}</strong> on <strong>{occasionLabel}</strong> · Budget {budget}
                </p>
                {result.summary && result.source === 'ai' && <p className="gf-results-sub">{result.summary}</p>}
              </div>
              {result.picks.length === 0 ? (
                <div className="gf-no-results"><p>{result.summary}</p></div>
              ) : (
                <div className="gf-results-grid">
                  {result.picks.map((p) => <ResultCard key={p.product.id} pick={p} />)}
                </div>
              )}
              <button type="button" className="gf-btn-done" onClick={closeGiftFinder}>Close</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
