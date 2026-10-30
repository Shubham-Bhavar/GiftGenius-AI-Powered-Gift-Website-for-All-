import { useEffect, useState } from 'react';
import SafeImg from '../common/SafeImg.jsx';
import { ErrorNote } from '../common/ui.jsx';
import { giftBoxApi } from '../../services/giftbox.js';
import { rupees } from '../../utils/format.js';

export const MAX_BOX = 6;

const STATUS = {
  good: ['✓', 'Good'], warn: ['⚠', 'Worth a look'], bad: ['✕', 'Doesn’t fit'], info: ['ℹ', 'Note'], unknown: ['?', 'Not checked'],
};

/** Compatibility checks, each with its status in words for screen readers. */
export function BoxChecks({ checks }) {
  if (!checks?.length) return null;
  return (
    <ul className="box-checks" aria-label="How well these go together">
      {checks.map((c) => (
        <li key={`${c.dimension}-${c.text}`} className={`box-check box-check--${c.status}`}>
          <span aria-hidden="true">{STATUS[c.status]?.[0] ?? '•'}</span>
          <span className="sr-only">{STATUS[c.status]?.[1] ?? c.status}: </span>
          {c.text}
        </li>
      ))}
    </ul>
  );
}

/**
 * Several gifts in one box: suggestions that together fit the budget (chosen by the recommendation engine, never
 * over budget, one gift of each kind), and a box to build by hand: drag gifts in from the shelf, reorder them, swap
 * or remove them, with the total and the compatibility checks updating as you go. Every action also has a button.
 */
export function BoxComposer({ context, catalog, onUse }) {
  const [budget, setBudget] = useState(context.budget ?? 1500);
  const [size, setSize] = useState(3);
  const [suggested, setSuggested] = useState({ busy: false, result: null, error: null });
  const [box, setBox] = useState([]); // product ids, in the order they sit in the box
  const [report, setReport] = useState(null);
  const [query, setQuery] = useState('');
  const [seen, setSeen] = useState([]); // products from suggestions, which may be beyond the catalogue page
  const byId = new Map([...seen, ...catalog].map((p) => [p.id, p]));
  const items = box.map((id) => byId.get(id)).filter(Boolean);
  const total = items.reduce((sum, p) => sum + Number(p.price), 0);

  useEffect(() => {
    if (box.length === 0) return undefined;
    const controller = new AbortController();
    const t = setTimeout(() => {
      giftBoxApi.check({ productIds: box, budget: budget || undefined, occasion: context.occasion, recipient: context.recipient },
        controller.signal).then(setReport, () => {});
    }, 350);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [box, budget, context.occasion, context.recipient]);

  const suggest = async () => {
    setSuggested({ busy: true, result: null, error: null });
    try {
      const result = await giftBoxApi.suggestions({
        budget, size, recipient: context.recipient, occasion: context.occasion, interests: context.interests,
        personality: context.personality,
      });
      setSuggested({ busy: false, result, error: null });
      setSeen((s) => [...s, ...result.boxes.flatMap((b) => b.items.map((x) => x.product))]);
    } catch (error) {
      setSuggested({ busy: false, result: null, error });
    }
  };
  const add = (id, at = box.length) => setBox((b) => (b.includes(id) || b.length >= MAX_BOX ? b : [...b.slice(0, at), id, ...b.slice(at)]));
  const move = (from, to) => setBox((b) => {
    const next = [...b];
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
  });
  const remove = (id) => setBox((b) => b.filter((x) => x !== id));
  const onDrop = (e, at) => {
    e.preventDefault();
    const [kind, value] = e.dataTransfer.getData('text/plain').split(':');
    if (kind === 'add') add(Number(value), at);
    if (kind === 'move') move(Number(value), Math.min(at, box.length - 1));
  };
  const shelf = catalog
    .filter((p) => p.inStock && !box.includes(p.id) && p.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 12);

  return (
    <div className="box-composer">
      <section aria-labelledby="box-suggest-h">
        <h2 id="box-suggest-h" className="studio-h">Suggest boxes within a budget</h2>
        <div className="box-form">
          <label className="studio-label" htmlFor="box-budget">Budget (₹)</label>
          <input id="box-budget" className="pd-input" type="number" min={1} max={1000000} value={budget}
            onChange={(e) => setBudget(Math.max(0, Math.min(1000000, Number(e.target.value) || 0)))} />
          <label className="studio-label" htmlFor="box-size">Gifts in the box</label>
          <select id="box-size" className="pd-input" value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="button" className="btn-primary" disabled={suggested.busy || budget < 1} onClick={suggest}>
            {suggested.busy ? 'Finding boxes…' : '✨ Suggest boxes'}
          </button>
        </div>
        <ErrorNote error={suggested.error} onRetry={suggest} />
        {suggested.result?.note && <p className="studio-hint">{suggested.result.note}</p>}
        {suggested.result?.boxes?.length > 0 && (
          <ul className="box-suggestions">
            {suggested.result.boxes.map((b, i) => (
              <li key={b.items.map((x) => x.product.id).join('-')} className="box-suggestion">
                <h3>Box {i + 1} · {rupees(b.total)}</h3>
                <ul className="box-suggestion-items">
                  {b.items.map(({ product, reason }) => (
                    <li key={product.id}>
                      <SafeImg src={product.image} alt="" />
                      <span><strong>{product.name}</strong> {rupees(product.price)}<br /><small>{reason}</small></span>
                    </li>
                  ))}
                </ul>
                <BoxChecks checks={b.checks} />
                <div className="box-suggestion-actions">
                  <button type="button" className="studio-link-btn" onClick={() => setBox(b.items.map((x) => x.product.id))}>Edit this box</button>
                  <button type="button" className="btn-primary" onClick={() => onUse(b.items.map((x) => x.product.id))}>Preview this box →</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="box-build-h">
        <h2 id="box-build-h" className="studio-h">Or build your own box</h2>
        <div className="box-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, box.length)}
          aria-label={`Your box: ${items.length} of ${MAX_BOX} gifts`} role="group">
          {items.length === 0 && <p className="box-empty">Drag gifts here, or use “Add” on the shelf.</p>}
          <ol className="box-slots">
            {items.map((p, i) => (
              <li key={p.id} className="box-slot" draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', `move:${i}`)}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
                  e.stopPropagation();
                  onDrop(e, i);
                }}>
                <SafeImg src={p.image} alt="" />
                <span className="box-slot-name">{p.name}</span>
                <span className="box-slot-price">{rupees(p.price)}</span>
                <span className="box-slot-actions">
                  <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${p.name} earlier`}>←</button>
                  <button type="button" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`}>✕</button>
                  <button type="button" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${p.name} later`}>→</button>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="box-meter" aria-live="polite">
          <span>Total {rupees(total)}</span>
          {budget > 0 && (
            <span className={total <= budget ? 'is-ok' : 'is-over'}>
              {total <= budget ? `${rupees(budget - total)} left of ${rupees(budget)}` : `${rupees(total - budget)} over ${rupees(budget)}`}
            </span>
          )}
        </div>
        {items.length > 0 && report && <BoxChecks checks={report.checks} />}
        {items.length > 0 && (
          <button type="button" className="btn-primary" onClick={() => onUse(box)}>Preview this box →</button>
        )}

        <h3 className="studio-label">Shelf</h3>
        <label htmlFor="box-shelf-search" className="sr-only">Search the shelf</label>
        <input id="box-shelf-search" className="pd-input" type="search" placeholder="Search gifts…" value={query}
          onChange={(e) => setQuery(e.target.value)} />
        <ul className="box-shelf">
          {shelf.map((p) => (
            <li key={p.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', `add:${p.id}`)}>
              <SafeImg src={p.image} alt="" />
              <span className="box-slot-name">{p.name}</span>
              <span className="box-slot-price">{rupees(p.price)}</span>
              <button type="button" className="studio-link-btn" disabled={box.length >= MAX_BOX} onClick={() => add(p.id)}
                aria-label={`Add ${p.name} to the box`}>Add</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
