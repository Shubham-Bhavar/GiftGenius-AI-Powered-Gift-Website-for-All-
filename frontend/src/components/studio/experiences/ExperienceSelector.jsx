import { EXPERIENCES } from './experiences.js';

const CLASSIC = {
  key: 'classic',
  name: 'Classic reveal',
  description: 'The box you dressed, step by step, in your own colours, wrap and card.',
  theme: 'Your chosen look',
};

/** Choose how the reveal plays. Preview shows it once without changing the choice; Use keeps it. */
export function ExperienceSelector({ selected, shown, onPreview, onUse }) {
  const cards = [CLASSIC, ...Object.values(EXPERIENCES)];
  return (
    <section className="exp-select" aria-labelledby="exp-select-h">
      <h2 id="exp-select-h" className="studio-h">Choose Your Reveal Experience</h2>
      <ul className="exp-cards">
        {cards.map((c) => (
          <li key={c.key} className={`exp-card${shown === c.key ? ' is-shown' : ''}`}>
            <span className={`exp-swatch${c.swatch ? '' : ' exp-swatch--classic'}`} aria-hidden="true"
              style={c.swatch ? { '--sw-box': c.swatch.box, '--sw-ribbon': c.swatch.ribbon } : undefined}><i /></span>
            <div className="exp-card-text">
              <h3>{c.name}</h3>
              <p>{c.description}</p>
              <p className="exp-card-theme">{c.theme}</p>
            </div>
            <div className="exp-card-actions">
              <button type="button" className="studio-link-btn" onClick={() => onPreview(c.key)} aria-label={`Preview Experience: ${c.name}`}>Preview Experience</button>
              <button type="button" className="studio-link-btn" aria-pressed={selected === c.key} onClick={() => onUse(c.key)}
                aria-label={`${selected === c.key ? 'In use' : 'Use This Experience'}: ${c.name}`}>{selected === c.key ? '✓ In use' : 'Use This Experience'}</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
