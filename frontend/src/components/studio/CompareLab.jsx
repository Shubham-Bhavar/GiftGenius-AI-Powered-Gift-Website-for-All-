import { useState } from 'react';
import { rupees } from '../../utils/format.js';
import { GiftBox3D } from './GiftBox3D.jsx';
import { CARD_STYLES, THEMES, THEME_KEYS, describeLook, themeLook } from './look.js';
import { totalOf } from './BuyerSummary.jsx';

const lookOf = (c) => ({ box: c.box, ribbon: c.ribbon, pattern: c.pattern, tissue: THEMES[c.theme].tissue });
const withTheme = (c, key) => ({ ...c, ...themeLook(key) });

/**
 * Why one option suits better, from what the shopper told us: budget fit, a theme matching their style, photos on the
 * card. It compares the options against those answers only and says so.
 */
export function compareAdvice(a, b, { budget, suggestions = [], photos = [] }) {
  const lines = [];
  const options = [['A', a], ['B', b]];
  if (budget) {
    const fits = options.filter(([, o]) => o.total <= budget);
    if (fits.length === 1) {
      const [over] = options.filter(([, o]) => o.total > budget);
      lines.push(`Option ${fits[0][0]} fits your ${rupees(budget)} budget; option ${over[0]} is ${rupees(over[1].total - budget)} over.`);
    }
  }
  const top = suggestions[0];
  if (top) {
    const match = options.filter(([, o]) => o.config.theme === top.theme);
    if (match.length === 1) lines.push(`Option ${match[0][0]} uses ${THEMES[top.theme].label}: ${top.why.toLowerCase()}.`);
  }
  if (photos.length > 0) {
    const photo = options.filter(([, o]) => o.config.card === 'photo');
    if (photo.length === 1) lines.push(`Option ${photo[0][0]} carries your photos on the card, which makes it more personal.`);
  }
  if (lines.length === 0) lines.push('Both fit what you told us equally well, so choose the one that feels more like them.');
  return lines;
}

/**
 * Compare presentations: the same gift in every theme side by side, and two complete options (A: what's in the
 * studio now, B: another theme and, if you like, another gift) with their prices, budget fit and look.
 */
export function CompareLab({ config, products, catalog, photos, suggestions, onApply }) {
  const firstOther = suggestions.find((s) => s.theme !== config.theme)?.theme ?? THEME_KEYS.find((k) => k !== config.theme);
  const [bTheme, setBTheme] = useState(firstOther);
  const [bProductId, setBProductId] = useState('');
  const bConfig = withTheme(config, bTheme);
  const bProducts = bProductId ? catalog.filter((p) => String(p.id) === bProductId) : products;
  const a = { config, products, total: totalOf(products) };
  const b = { config: bConfig, products: bProducts, total: totalOf(bProducts) };
  const advice = compareAdvice(a, b, { budget: config.budget, suggestions, photos });

  return (
    <div className="compare-lab">
      <section aria-labelledby="compare-themes-h">
        <h2 id="compare-themes-h" className="studio-h">One gift, every theme</h2>
        <ul className="theme-gallery">
          {THEME_KEYS.map((key) => {
            const c = withTheme(config, key);
            return (
              <li key={key} className={config.theme === key ? 'is-current' : ''}>
                <GiftBox3D look={lookOf(c)} size="sm" photos={photos} label={`${THEMES[key].label}: ${describeLook(lookOf(c))}`} />
                <span className="theme-gallery-name">{THEMES[key].label}</span>
                <button type="button" className="studio-link-btn" aria-pressed={config.theme === key}
                  onClick={() => onApply(themeLook(key))}>
                  {config.theme === key ? '✓ In use' : `Use ${THEMES[key].label}`}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="compare-ab-h">
        <h2 id="compare-ab-h" className="studio-h">Option A or option B?</h2>
        <div className="ab-controls">
          <label className="studio-label" htmlFor="ab-theme">Option B theme</label>
          <select id="ab-theme" className="pd-input" value={bTheme} onChange={(e) => setBTheme(e.target.value)}>
            {THEME_KEYS.map((k) => <option key={k} value={k}>{THEMES[k].label}</option>)}
          </select>
          <label className="studio-label" htmlFor="ab-gift">Option B gift</label>
          <select id="ab-gift" className="pd-input" value={bProductId} onChange={(e) => setBProductId(e.target.value)}>
            <option value="">The same as option A</option>
            {catalog.map((p) => <option key={p.id} value={p.id}>{p.name} ({rupees(p.price)})</option>)}
          </select>
        </div>
        <div className="ab-grid">
          {[['A', a], ['B', b]].map(([key, o]) => (
            <div key={key} className="ab-option">
              <h3>Option {key}</h3>
              <GiftBox3D look={lookOf(o.config)} size="sm" photos={photos} items={o.products} />
              <table className="ab-table">
                <tbody>
                  <tr><th scope="row">Gifts</th><td>{o.products.map((p) => p.name).join(', ') || 'None'}</td></tr>
                  <tr><th scope="row">Total</th><td>{rupees(o.total)}</td></tr>
                  {config.budget && <tr><th scope="row">Budget</th><td>{o.total <= config.budget ? '✓ Within budget' : `✕ ${rupees(o.total - config.budget)} over`}</td></tr>}
                  <tr><th scope="row">Packaging</th><td>{THEMES[o.config.theme].label}: {describeLook(lookOf(o.config))}</td></tr>
                  <tr><th scope="row">Card</th><td>{CARD_STYLES[o.config.card]}</td></tr>
                </tbody>
              </table>
              {key === 'B' && (
                <button type="button" className="studio-link-btn" onClick={() => onApply(themeLook(bTheme), bProductId ? [Number(bProductId)] : null)}>
                  Use option B
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="ab-advice" role="status">
          <h3>What fits better</h3>
          <ul>{advice.map((line) => <li key={line}>{line}</li>)}</ul>
          <p className="studio-note">This compares the options against what you told us. It can’t predict how they’ll feel.</p>
        </div>
      </section>
    </div>
  );
}
