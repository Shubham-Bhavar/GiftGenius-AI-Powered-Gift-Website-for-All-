import { GiftMessageHelper } from '../ai/GiftMessageHelper.jsx';
import { MemoryPhotos } from './MemoryPhotos.jsx';
import {
  BOX_COLOURS, CARD_STYLES, PATTERNS, RIBBON_COLOURS, THEMES, THEME_KEYS,
} from './look.js';

export const personalisable = (p) => p.category === 'personalized' || p.tags?.includes('personalized');

function Swatches({ legend, name, colours, value, onChange }) {
  return (
    <fieldset className="studio-swatches">
      <legend className="studio-label">{legend}</legend>
      {colours.map(([hex, label]) => (
        <label key={hex} className="swatch" title={label}>
          <input type="radio" name={name} value={hex} checked={value === hex} onChange={() => onChange(hex)} />
          <span className="swatch-dot" style={{ background: hex }} aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * The studio's controls: a theme (suggested from what the shopper told us, with the reason), then every part of the
 * presentation, the personal touches and how the reveal plays. Packaging choices are a preview only.
 */
export function StudioControls({ config, update, applyTheme, suggestions, products, photos, setPhotos }) {
  const set = (k) => (e) => update({ [k]: e.target.value });
  const engravable = products.filter(personalisable);

  return (
    <div className="studio-controls">
      <section aria-labelledby="studio-theme-h">
        <h2 id="studio-theme-h" className="studio-h">Theme</h2>
        {suggestions.length > 0 && (
          <ul className="studio-suggestions">
            {suggestions.slice(0, 2).map((s) => (
              <li key={s.theme}>
                <button type="button" className="studio-link-btn" onClick={() => applyTheme(s.theme)}>
                  ✨ {THEMES[s.theme].label}
                </button> <span>{s.why}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="studio-themes" role="group" aria-label="Themes">
          {THEME_KEYS.map((key) => {
            const t = THEMES[key];
            return (
              <button key={key} type="button" className="studio-theme" aria-pressed={config.theme === key} onClick={() => applyTheme(key)}>
                <span className="studio-theme-chips" aria-hidden="true">
                  <i style={{ background: t.box }} /><i style={{ background: t.ribbon }} /><i style={{ background: t.tissue }} />
                </span>
                <span className="studio-theme-name">{t.label}</span>
                <span className="studio-theme-blurb">{t.blurb}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="studio-wrap-h">
        <h2 id="studio-wrap-h" className="studio-h">Wrapping</h2>
        <Swatches legend="Box colour" name="studio-box" colours={BOX_COLOURS} value={config.box} onChange={(box) => update({ box })} />
        <Swatches legend="Ribbon" name="studio-ribbon" colours={RIBBON_COLOURS} value={config.ribbon} onChange={(ribbon) => update({ ribbon })} />
        <label className="studio-label" htmlFor="studio-pattern">Wrap</label>
        <select id="studio-pattern" className="pd-input" value={config.pattern} onChange={set('pattern')}>
          {Object.entries(PATTERNS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <label className="studio-label" htmlFor="studio-card">Card</label>
        <select id="studio-card" className="pd-input" value={config.card} onChange={set('card')}>
          {Object.entries(CARD_STYLES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <p className="studio-hint">Packaging choices are a preview only: they aren’t added to your order, and actual wrapping may differ.</p>
      </section>

      <section aria-labelledby="studio-personal-h">
        <h2 id="studio-personal-h" className="studio-h">Personal touches</h2>
        <label className="studio-label" htmlFor="studio-name">Their name</label>
        <input id="studio-name" className="pd-input" maxLength={40} value={config.name} placeholder="e.g. Aditi" onChange={set('name')} />
        {engravable.length > 0 && (
          <>
            <label className="studio-label" htmlFor="studio-engraving">Name to print or engrave on the {engravable[0].name}</label>
            <input id="studio-engraving" className="pd-input" maxLength={80} value={config.engraving} onChange={set('engraving')} />
          </>
        )}
        <label className="studio-label" htmlFor="studio-message">Card message</label>
        <textarea id="studio-message" className="pd-input" rows={3} maxLength={300} value={config.message}
          placeholder="What do you want them to read?" onChange={set('message')} />
        <div className="pd-counter">{config.message.length}/300</div>
        {products[0] && <GiftMessageHelper product={products[0]} onPick={(message) => update({ message })} />}
        <MemoryPhotos photos={photos} onChange={setPhotos} />
      </section>

    </div>
  );
}
