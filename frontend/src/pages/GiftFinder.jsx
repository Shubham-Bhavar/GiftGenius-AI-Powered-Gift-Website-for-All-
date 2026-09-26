import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import SafeImg from '../components/SafeImg.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../lib/api.js';

/*
 * The AI Gift Quiz: the original 6-question quiz page, answered by the backend gift advisor
 * (Gemini re-ranking a shortlist of real, in-stock products, with a rule-based fallback).
 * Each option carries what it means for the API: recipient/occasion/interest/personality values,
 * plus a note for answers the catalog has no field for (e.g. "Wedding", "Child").
 */
const QUESTIONS = [
  {
    field: 'recipient', title: 'Who are you gifting? 🎁', label: "Let's find the perfect gift",
    options: [
      { icon: '👨‍👩‍👧', label: 'Mom / Dad', value: 'parent' },
      { icon: '💑', label: 'Partner / Spouse', value: 'partner' },
      { icon: '🤝', label: 'Best Friend', value: 'friend' },
      { icon: '👫', label: 'Sibling', value: 'sibling' },
      { icon: '💼', label: 'Colleague / Boss', value: 'colleague' },
      { icon: '👶', label: 'Child / Baby', value: '', note: 'The gift is for a child or baby.' },
    ],
  },
  {
    field: 'occasion', title: "What's the occasion? 🎉", label: 'Understanding the occasion',
    options: [
      { icon: '🎂', label: 'Birthday', value: 'birthday' },
      { icon: '💍', label: 'Anniversary', value: 'anniversary' },
      { icon: '🪔', label: 'Festival / Diwali', value: 'festival' },
      { icon: '💒', label: 'Wedding', value: 'anniversary', note: 'It is a wedding gift.' },
      { icon: '🎓', label: 'Graduation', value: 'graduation' },
      { icon: '💌', label: 'Just Because', value: '' },
    ],
  },
  {
    field: 'interests', multi: true, title: 'What are their interests? 🌟', label: 'Getting to know them', hint: 'Pick up to three',
    options: [
      { icon: '👗', label: 'Fashion & Style', value: 'accessories' },
      { icon: '🍫', label: 'Food & Sweets', value: 'food & sweets' },
      { icon: '✍️', label: 'Books & Journaling', value: 'personalized' },
      { icon: '🎨', label: 'Art & Culture', value: 'cultural' },
      { icon: '🌸', label: 'Flowers & Fragrance', value: 'flowers', also: 'fragrance' },
      { icon: '🧘', label: 'Wellness & Self-Care', value: 'wellness' },
      { icon: '🏡', label: 'Home & Decor', value: 'home decor' },
      { icon: '🎁', label: 'A Bit of Everything', value: 'gift sets' },
    ],
  },
  {
    field: 'personality', title: "What's their vibe? ✨", label: 'Reading their personality',
    options: [
      { icon: '🤍', label: 'Minimalist & Elegant', value: 'minimalist' },
      { icon: '🎨', label: 'Fun & Quirky', value: 'creative' },
      { icon: '💎', label: 'Luxury & Premium', value: 'expressive' },
      { icon: '🌿', label: 'Practical & Useful', value: 'practical' },
    ],
  },
  {
    field: 'budget', title: "What's your budget? 💰", label: 'Understanding your budget',
    options: [
      { icon: '🪙', label: 'Under ₹500', value: 500 },
      { icon: '💵', label: '₹500 – ₹1,500', value: 1500 },
      { icon: '💳', label: '₹1,500 – ₹5,000', value: 5000 },
      { icon: '💎', label: '₹5,000+', value: 0 },
    ],
  },
];
const TOTAL = QUESTIONS.length + 1; // + the free-text question

const pad = (n) => String(n).padStart(2, '0');

function ResultCard({ pick, index }) {
  const cart = useCart();
  const toast = useToast();
  const [added, setAdded] = useState(false);
  const p = pick.product;
  const discount = Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100);
  return (
    <div className="result-pcard" style={{ animationDelay: `${0.05 + index * 0.08}s` }}>
      <Link to={`/product/${p.id}`} className="rpc-img-wrap">
        <SafeImg src={p.image} alt={p.alt || p.name} className="rpc-img" loading="lazy" />
        {discount > 0 && <span className="rpc-discount">{discount}% OFF</span>}
      </Link>
      <div className="rpc-body">
        <div className="rpc-cat">{p.category}</div>
        <Link to={`/product/${p.id}`} className="rpc-name">{p.name}</Link>
        <p className="rpc-desc">{p.description}</p>
        <div className="rpc-reason">✨ {pick.reason}</div>
        <div className="rpc-foot">
          <div className="rpc-prices">
            {discount > 0 && <span className="rpc-og">₹{Number(p.originalPrice).toLocaleString('en-IN')}</span>}
            <span className="rpc-now">₹{Number(p.price).toLocaleString('en-IN')}</span>
          </div>
          <button type="button" className="rpc-add" disabled={added} onClick={async () => {
            try {
              await cart.add(p, 1);
              setAdded(true);
              toast(`${p.name} added to cart 🛒`);
            } catch (err) {
              toast(err.message, 'bad');
            }
          }}>{added ? '✓ Added' : '+ Add to Cart'}</button>
        </div>
      </div>
    </div>
  );
}

export default function GiftFinder() {
  useDocumentTitle('AI Gift Quiz');
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState({}); // field -> selected option(s)
  const [extra, setExtra] = useState('');
  const [phase, setPhase] = useState('quiz'); // quiz | thinking | results
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const card = useRef(null);

  useEffect(() => {
    card.current?.querySelector('.q-text, .result-header h2')?.focus({ preventScroll: true });
  }, [step, phase]);

  const q = QUESTIONS[step - 1];
  const selected = (opt) => {
    const a = answers[q.field];
    return q.multi ? (a ?? []).includes(opt) : a === opt;
  };
  const choose = (opt) => {
    if (!q.multi) {
      setAnswers((s) => ({ ...s, [q.field]: opt }));
      return;
    }
    const cur = answers[q.field] ?? [];
    // Side effects (the toast) stay out of the state updater, which React may call more than once.
    if (!cur.includes(opt) && cur.length >= 3) {
      toast('Pick up to three interests.', 'bad');
      return;
    }
    setAnswers((s) => {
      const list = s[q.field] ?? [];
      return { ...s, [q.field]: list.includes(opt) ? list.filter((o) => o !== opt) : [...list, opt] };
    });
  };
  const answered = q ? (q.multi ? (answers[q.field] ?? []).length > 0 : answers[q.field] !== undefined) : true;

  const submit = async () => {
    setPhase('thinking');
    setError(null);
    const notes = [answers.recipient?.note, answers.occasion?.note, extra.trim()].filter(Boolean).join(' ');
    const interests = (answers.interests ?? []).flatMap((o) => [o.value, o.also].filter(Boolean));
    const started = Date.now();
    try {
      const res = await api.recommend({
        recipient: answers.recipient?.value || undefined,
        occasion: answers.occasion?.value || undefined,
        budget: answers.budget?.value || undefined,
        interests,
        personality: answers.personality?.value || undefined,
        notes: notes || undefined,
        limit: 4,
      });
      await new Promise((r) => setTimeout(r, Math.max(0, 900 - (Date.now() - started))));
      setResult(res);
      setPhase('results');
    } catch (err) {
      setError(err);
      setPhase('quiz');
    }
  };

  const restart = () => {
    setAnswers({});
    setExtra('');
    setResult(null);
    setStep(1);
    setPhase('quiz');
  };

  const progressStep = phase === 'quiz' ? step : TOTAL;
  const progressLabel = phase === 'results' ? 'Your matches are ready' : phase === 'thinking' ? 'Finding your matches' : (q?.label ?? 'Almost done');
  const who = answers.recipient?.label ?? 'them';

  return (
    <div className="quiz-page">
      <section className="page-hero">
        <div className="page-eyebrow"><span className="eyebrow-line" />Smart Recommendations<span className="eyebrow-line" /></div>
        <h1>Find the <em>Perfect Gift</em><br />in 60 Seconds</h1>
        <p>Answer a few quick questions and GiftGenius AI will match the best gifts from our curated catalog.</p>
      </section>

      <div className="qz-progress-wrap">
        <div className="qz-progress-header">
          <span className="qz-progress-label">{progressLabel}</span>
          <span className="qz-progress-step">{pad(progressStep)} / {pad(TOTAL)}</span>
        </div>
        <div className="qz-progress-bar" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={progressStep}
          aria-label={`Question ${progressStep} of ${TOTAL}`}>
          <div className="qz-progress-fill" style={{ width: `${(progressStep / TOTAL) * 100}%` }} />
        </div>
      </div>

      <div className="quiz-container" ref={card}>
        {phase === 'quiz' && q && (
          <div className="question-card active" key={step}>
            <div className="q-number">Question {pad(step)}</div>
            <h2 className="q-text" tabIndex={-1}>{q.title}</h2>
            {q.hint && <p className="q-hint">{q.hint}</p>}
            <div className="options-grid" role="group" aria-label={q.title}>
              {q.options.map((o) => (
                <button key={o.label} type="button" className={`option-btn ${selected(o) ? 'selected' : ''}`} aria-pressed={selected(o)}
                  onClick={() => choose(o)}>
                  <span className="opt-icon" aria-hidden="true">{o.icon}</span> {o.label}
                </button>
              ))}
            </div>
            <div className="nav-btns">
              {step > 1 && <button type="button" className="btn-back" onClick={() => setStep((s) => s - 1)}>← Back</button>}
              <button type="button" className="btn-next" disabled={!answered} onClick={() => setStep((s) => s + 1)}>Next →</button>
            </div>
          </div>
        )}

        {phase === 'quiz' && !q && (
          <div className="question-card active">
            <div className="q-number">Question {pad(TOTAL)}</div>
            <h2 className="q-text" tabIndex={-1}>Any extra details? <span className="q-optional">(optional)</span></h2>
            <label htmlFor="extra-details" className="sr-only">Extra details about them</label>
            <textarea className="text-input" id="extra-details" rows={4} maxLength={600} value={extra}
              placeholder="e.g. She loves coffee, hates jewellery, recently started yoga…" onChange={(e) => setExtra(e.target.value)} />
            <div className="q-counter">{extra.length}/600</div>
            {error && <p className="gg-alert gg-alert--error" role="alert">{error.message}</p>}
            <div className="nav-btns">
              <button type="button" className="btn-back" onClick={() => setStep((s) => s - 1)}>← Back</button>
              <button type="button" className="btn-next" onClick={submit}>✨ Find My Gifts</button>
            </div>
          </div>
        )}

        {phase !== 'quiz' && (
          <div className="result-section">
            <div className="result-header">
              <div className="result-icon" aria-hidden="true">🎁</div>
              <h2 tabIndex={-1}>Your Gift Matches</h2>
              {phase === 'results' && result && (
                <>
                  <p>
                    {result.picks.length} gifts for your <strong>{who}</strong>
                    {answers.occasion?.value ? <> · <strong>{answers.occasion.label}</strong></> : null}
                    {' · '}<span className={`rpc-source rpc-source--${result.source}`}>{result.source === 'ai' ? '✨ Picked by GiftGenius AI' : 'Matched from our curated catalog'}</span>
                  </p>
                  {result.summary && <p className="result-summary">{result.summary}</p>}
                </>
              )}
            </div>

            {phase === 'thinking' && (
              <div className="thinking-box">
                <div className="thinking-dots"><span /><span /><span /></div>
                <p>Scoring your matches…</p>
              </div>
            )}

            {phase === 'results' && result && (
              result.picks.length > 0 ? (
                <div className="results-grid">
                  {result.picks.map((p, i) => <ResultCard key={p.product.id} pick={p} index={i} />)}
                </div>
              ) : (
                <div className="no-results-box">
                  <h3>No exact matches found</h3>
                  <p>{result.summary || 'Try increasing your budget or choosing a different occasion.'}</p>
                </div>
              )
            )}

            {phase === 'results' && result?.giftMessage && (
              <div className="qz-message">
                <div className="q-number">A card message you can use</div>
                <blockquote>{result.giftMessage}</blockquote>
                <button type="button" className="restart-btn qz-copy" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(result.giftMessage);
                    toast('Message copied — paste it into the gift card box on any product ✨');
                  } catch {
                    toast("Couldn't copy. Select the text and copy it instead.", 'bad');
                  }
                }}>📋 Copy message</button>
              </div>
            )}

            {phase === 'results' && (
              <div className="result-actions">
                <Link className="shop-btn" to="/shop">🛍️ Browse All Gifts →</Link>
                <button type="button" className="restart-btn" onClick={restart}>↺ Take Quiz Again</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
