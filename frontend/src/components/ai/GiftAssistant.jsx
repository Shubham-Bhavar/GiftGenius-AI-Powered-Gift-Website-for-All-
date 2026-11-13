import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import SafeImg from '../common/SafeImg.jsx';
import { aiApi } from '../../services/ai.js';
import { rupees } from '../../utils/format.js';

/** The API reads at most this many of the shopper's messages; after that a new conversation starts. */
export const MAX_TURNS = 8;
const MAX_LENGTH = 500;
const MAX_COMPARE = 3;
const STARTERS = [
  'A birthday gift for my mom under ₹1,500',
  'Something for a colleague who loves tea',
  'An anniversary gift for my wife',
];
/** Pages where a floating assistant would get in the way: paying, and the back offices. */
const HIDDEN_ON = [/^\/checkout/, /^\/admin/, /^\/seller/];

/** One gift the assistant suggested: a real catalogue product, with why it fits and a link to its page. */
function AssistantPick({ pick, compared, canCompare, onCompare }) {
  const p = pick.product;
  return (
    <li className="ga-pick">
      <SafeImg src={p.image} alt="" className="ga-pick-img" loading="lazy" />
      <div className="ga-pick-body">
        <Link to={`/product/${p.id}`} className="ga-pick-name">{p.name}</Link>
        <p className="ga-pick-meta">
          <span>{rupees(p.price)}</span>
          {p.rating ? <span aria-label={`Rated ${p.rating} out of 5`}>★ {p.rating}</span> : null}
          {pick.match != null && <span>{pick.match}% match</span>}
        </p>
        {pick.reason && <p className="ga-pick-why">{pick.reason}</p>}
        <label className="ga-compare">
          <input type="checkbox" checked={compared} disabled={!compared && !canCompare} onChange={() => onCompare(p)} />
          Compare
        </label>
      </div>
    </li>
  );
}

/** Up to three suggested gifts side by side, on what the catalogue says about them. */
function Comparison({ products, reasons, onClear }) {
  return (
    <section className="ga-comparison" aria-labelledby="ga-compare-h">
      <div className="ga-comparison-head">
        <h3 id="ga-compare-h">Side by side</h3>
        <button type="button" className="ga-link" onClick={onClear}>Clear</button>
      </div>
      <div className="ga-table-wrap">
        <table>
          <thead>
            <tr><th scope="col"><span className="sr-only">Detail</span></th>{products.map((p) => <th key={p.id} scope="col">{p.name}</th>)}</tr>
          </thead>
          <tbody>
            <tr><th scope="row">Price</th>{products.map((p) => <td key={p.id}>{rupees(p.price)}</td>)}</tr>
            <tr><th scope="row">Rating</th>{products.map((p) => <td key={p.id}>{p.rating ? `★ ${p.rating} (${p.reviewCount ?? 0})` : '—'}</td>)}</tr>
            <tr><th scope="row">Category</th>{products.map((p) => <td key={p.id}>{p.category}</td>)}</tr>
            <tr><th scope="row">In stock</th>{products.map((p) => <td key={p.id}>{p.inStock ? 'Yes' : 'No'}</td>)}</tr>
            <tr><th scope="row">Why</th>{products.map((p) => <td key={p.id}>{reasons[p.id] ?? '—'}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * The gift shopping assistant: a small, non-modal panel that answers in plain words with gifts from the real
 * catalogue, asks a follow-up question when something useful is missing, compares up to three suggestions, and links
 * to their pages. It never adds to the cart or places an order: the shopper decides on the product page.
 */
export default function GiftAssistant() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState([]); // what the shopper said, oldest first: what the API reads
  const [log, setLog] = useState([]); // { from: 'you' | 'assistant', text, question?, picks? }
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null); // the turns to retry
  const [compare, setCompare] = useState([]);
  const run = useRef(0); // the conversation a reply belongs to: replies to an abandoned one are dropped
  const launcher = useRef(null);
  const input = useRef(null);
  const end = useRef(null);
  const titleId = useId();
  const panelId = useId();
  const hidden = HIDDEN_ON.some((re) => re.test(pathname));

  // Close on navigation (a product link), keeping the conversation for when it's opened again.
  useEffect(() => { setOpen(false); }, [pathname]);
  const full = turns.length >= MAX_TURNS;
  // Into the message box when the panel opens, and when a new conversation brings the box back.
  useEffect(() => {
    if (open && !full) input.current?.focus();
  }, [open, full]);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [log, busy]);

  if (hidden) return null;

  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };

  const send = async (nextTurns) => {
    const mine = run.current;
    setBusy(true);
    setFailed(null);
    try {
      const res = await aiApi.assistant({ messages: nextTurns });
      if (mine !== run.current) return;
      setLog((l) => [...l, { from: 'assistant', text: res.reply, question: res.question, picks: res.picks ?? [] }]);
    } catch {
      if (mine === run.current) setFailed(nextTurns);
    } finally {
      if (mine === run.current) setBusy(false);
    }
  };

  const submit = (text) => {
    const message = text.trim().slice(0, MAX_LENGTH);
    if (!message || busy || turns.length >= MAX_TURNS) return;
    const nextTurns = [...turns, message];
    setTurns(nextTurns);
    setLog((l) => [...l, { from: 'you', text: message }]);
    setDraft('');
    send(nextTurns);
  };

  const restart = () => {
    run.current += 1;
    setBusy(false);
    setTurns([]);
    setLog([]);
    setCompare([]);
    setFailed(null);
    setDraft('');
    if (!full) input.current?.focus();
  };

  const toggleCompare = (p) => setCompare((c) => (c.some((x) => x.id === p.id) ? c.filter((x) => x.id !== p.id)
    : c.length < MAX_COMPARE ? [...c, p] : c));
  const reasons = {};
  log.forEach((m) => m.picks?.forEach((pick) => { reasons[pick.product.id] ??= pick.reason; }));
  return (
    <>
      <button type="button" ref={launcher} className={`ga-launcher${open ? ' is-open' : ''}`} aria-expanded={open}
        aria-controls={panelId} onClick={() => (open ? close() : setOpen(true))}>
        <span aria-hidden="true">💬</span> {open ? 'Close assistant' : 'Gift assistant'}
      </button>
      <section id={panelId} className="ga-panel" role="dialog" aria-modal="false" aria-labelledby={titleId} hidden={!open}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
        <div className="ga-head">
          <div>
            <h2 id={titleId}>Gift assistant</h2>
            <p>Tell me who it’s for, the occasion and your budget. I suggest gifts from our shop only.</p>
          </div>
          <button type="button" className="ga-close" aria-label="Close the gift assistant" onClick={close}>✕</button>
        </div>

        <div className="ga-log" role="log" aria-live="polite" aria-relevant="additions">
          {log.length === 0 && (
            <div className="ga-starters">
              <p>Try one of these, or write your own:</p>
              {STARTERS.map((s) => (
                <button key={s} type="button" className="ga-chip" onClick={() => submit(s)}>{s}</button>
              ))}
            </div>
          )}
          {log.map((m, i) => (
            <div key={i} className={`ga-msg ga-msg--${m.from}`}>
              <p className="sr-only">{m.from === 'you' ? 'You said:' : 'The assistant said:'}</p>
              {m.text && <p className="ga-text">{m.text}</p>}
              {m.picks?.length > 0 && (
                <ul className="ga-picks" aria-label="Suggested gifts">
                  {m.picks.map((pick) => (
                    <AssistantPick key={pick.product.id} pick={pick} compared={compare.some((p) => p.id === pick.product.id)}
                      canCompare={compare.length < MAX_COMPARE} onCompare={toggleCompare} />
                  ))}
                </ul>
              )}
              {/* With nothing to go on, the reply is the question itself: say it once. */}
              {m.question && m.question !== m.text && <p className="ga-text ga-question">{m.question}</p>}
            </div>
          ))}
          {busy && <p className="ga-msg ga-msg--assistant ga-typing">Looking through the shop…</p>}
          {failed && (
            <div className="ga-msg ga-msg--assistant" role="alert">
              <p className="ga-text">I couldn’t reach the shop just now.</p>
              <button type="button" className="ga-link" onClick={() => send(failed)}>Try again</button>
            </div>
          )}
          <div ref={end} />
        </div>

        {compare.length >= 2 && <Comparison products={compare} reasons={reasons} onClear={() => setCompare([])} />}
        {compare.length === 1 && <p className="ga-hint">Tick one or two more to compare them.</p>}

        {full ? (
          <div className="ga-full">
            <p>That’s as much as I can keep in mind at once.</p>
            <button type="button" className="ga-link" onClick={restart}>Start a new conversation</button>
          </div>
        ) : (
          <form className="ga-form" onSubmit={(e) => { e.preventDefault(); submit(draft); }}>
            <label htmlFor={`${panelId}-input`} className="sr-only">Message the gift assistant</label>
            <input id={`${panelId}-input`} ref={input} className="ga-input" value={draft} maxLength={MAX_LENGTH}
              placeholder="e.g. My sister loves books, under ₹1,000" autoComplete="off"
              onChange={(e) => setDraft(e.target.value)} />
            <button type="submit" className="ga-send" disabled={busy || !draft.trim()}>Send</button>
          </form>
        )}
        <p className="ga-fine">
          I never add to your cart or place an order.
          {log.length > 0 && <> · <button type="button" className="ga-link" onClick={restart}>Start over</button></>}
        </p>
      </section>
    </>
  );
}
