import { useCallback, useMemo, useState } from 'react';
import { rupees } from '../../utils/format.js';
import { GiftBox3D } from './GiftBox3D.jsx';
import { CARD_STYLES, THEMES, THEME_KEYS, describeLook, themeLook } from './look.js';
import { totalOf } from './BuyerSummary.jsx';
import { CompareStage, cssLookOf } from './scene/CompareStage3D.jsx';

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

/** The rows of the side-by-side table: what each option is, in words, and whether the two differ. */
export function compareRows(a, b, budget) {
  const gifts = (o) => o.products.map((p) => p.name).join(', ') || 'None';
  const fit = (o) => (o.total <= budget ? '✓ Within budget' : `✕ ${rupees(o.total - budget)} over`);
  const packaging = (o) => `${THEMES[o.config.theme].label}: ${describeLook(cssLookOf(o.config))}`;
  const rows = [
    ['Gifts', gifts(a), gifts(b)],
    ['Total', rupees(a.total), rupees(b.total)],
    ...(budget ? [['Budget', fit(a), fit(b)]] : []),
    ['Packaging', packaging(a), packaging(b)],
    ['Card', CARD_STYLES[a.config.card], CARD_STYLES[b.config.card]],
  ];
  return rows.map(([label, av, bv]) => ({ label, a: av, b: bv, differs: av !== bv }));
}

/** A theme's tile picture: the 3D studio's own still, the CSS box where there's no 3D, or a quiet space while it's drawn. */
function ThemePicture({ still, config, photos, label }) {
  if (still === null) return <GiftBox3D look={cssLookOf(config)} size="sm" photos={photos} label={label} />;
  if (!still) return <div className="exp-thumb cmp-thumb-wait" role="img" aria-label={label} />;
  return <img className="exp-thumb" src={still} alt={label} width={320} height={240} />;
}

/**
 * Compare presentations in the studio: option A (what's in the studio now) and option B (another theme and, if you like,
 * another gift) in the same 3D room, the same gift in every theme, and the two side by side in words, with their prices,
 * budget fit and look. Nothing here is added to the order: choosing an option only changes the studio's settings.
 */
export function CompareLab({ config, products, catalog, photos, suggestions, onApply }) {
  const firstOther = suggestions.find((s) => s.theme !== config.theme)?.theme ?? THEME_KEYS.find((k) => k !== config.theme);
  const [bTheme, setBTheme] = useState(firstOther);
  const [bProductId, setBProductId] = useState('');
  // undefined while the studio draws them, null where there's no 3D (the CSS boxes stand in), else one still per theme.
  const [stills, setStills] = useState(undefined);
  const onStills = useCallback((next) => setStills(next), []);
  const bConfig = useMemo(() => withTheme(config, bTheme), [config, bTheme]);
  const bProducts = useMemo(() => (bProductId ? catalog.filter((p) => String(p.id) === bProductId) : products), [bProductId, catalog, products]);
  const a = { config, products, total: totalOf(products) };
  const b = { config: bConfig, products: bProducts, total: totalOf(bProducts) };
  const advice = compareAdvice(a, b, { budget: config.budget, suggestions, photos });
  const rows = compareRows(a, b, config.budget);
  const same = rows.every((row) => !row.differs);

  const options = useMemo(() => [
    { key: 'A', caption: `Your box now · ${THEMES[config.theme].label}`, config, items: products },
    { key: 'B', caption: THEMES[bTheme].label, config: bConfig, items: bProducts },
  ], [config, products, bTheme, bConfig, bProducts]);
  // Every theme, worn by the gift as it is now: the stills behind the theme tiles.
  const stillsFor = useMemo(() => THEME_KEYS.map((key) => ({ key, config: withTheme(config, key) })), [config]);

  return (
    <div className="studio-room compare-room">
      <section aria-labelledby="compare-ab-h" className="cmp-section">
        <h2 id="compare-ab-h" className="studio-h">Option A or option B?</h2>
        <p className="studio-hint">The same studio, camera and light for both: only your choices differ. Open them to see the gifts and the card.</p>
        <CompareStage options={options} photos={photos} stillsFor={stillsFor} onStills={onStills} />
      </section>

      <section aria-labelledby="compare-themes-h" className="cmp-section">
        <h2 id="compare-themes-h" className="studio-h">One gift, every theme</h2>
        <ul className="exp-cards cmp-themes">
          {THEME_KEYS.map((key) => {
            const c = withTheme(config, key);
            const inUse = config.theme === key;
            return (
              <li key={key} className={`exp-card${bTheme === key ? ' is-shown' : ''}${inUse ? ' is-current' : ''}`}>
                <ThemePicture still={stills === null ? null : stills?.[key]} config={c} photos={photos} label={`${THEMES[key].label}: ${describeLook(cssLookOf(c))}`} />
                <div className="exp-card-text">
                  <h3>{THEMES[key].label}</h3>
                  <p className="exp-card-theme">{THEMES[key].blurb}</p>
                </div>
                <div className="exp-card-actions">
                  <button type="button" aria-pressed={bTheme === key} aria-label={`Show ${THEMES[key].label} as option B`} onClick={() => setBTheme(key)}>
                    {bTheme === key ? 'Shown as option B' : 'Show as option B'}
                  </button>
                  <button type="button" aria-pressed={inUse} onClick={() => onApply(themeLook(key))}>
                    {inUse ? '✓ In use' : `Use ${THEMES[key].label}`}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="cmp-gift">
          <label className="studio-label" htmlFor="ab-gift">Option B gift</label>
          <select id="ab-gift" className="pd-input" value={bProductId} onChange={(e) => setBProductId(e.target.value)}>
            <option value="">The same as option A</option>
            {catalog.map((p) => <option key={p.id} value={p.id}>{p.name} ({rupees(p.price)})</option>)}
          </select>
        </div>
      </section>

      <section aria-labelledby="compare-table-h" className="cmp-section">
        <h2 id="compare-table-h" className="studio-h">Side by side</h2>
        <table className="cmp-table">
          <caption className="sr-only">Option A and option B, side by side. Rows marked as different are where they differ.</caption>
          <thead>
            <tr>
              <td />
              <th scope="col">Option A <span className="cmp-col-note">Your box now</span></th>
              <th scope="col">Option B <span className="cmp-col-note">{THEMES[bTheme].label}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className={row.differs ? 'is-different' : undefined}>
                <th scope="row">
                  {row.label}
                  {row.differs && <span className="cmp-differs"> · Different</span>}
                </th>
                <td>{row.a}</td>
                <td>{row.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {same && <p className="studio-hint">Option B is the same as option A: show another theme or choose another gift to compare.</p>}
        <div className="cmp-actions">
          <button type="button" className="cmp-primary" disabled={same} onClick={() => onApply(themeLook(bTheme), bProductId ? [Number(bProductId)] : null)}>
            Use option B
          </button>
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
