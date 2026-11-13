import { thumbFor } from '../scene/looks.js';
import { EXPERIENCES } from './experiences.js';

/** Choose how the reveal plays. Preview shows it once without changing the choice; Use keeps it. */
export function ExperienceSelector({ selected, shown, onPreview, onUse }) {
  const cards = Object.values(EXPERIENCES);
  const described = (EXPERIENCES[shown] ?? EXPERIENCES.royal).description;
  return (
    <section className="exp-select" aria-labelledby="exp-select-h">
      <h2 id="exp-select-h" className="studio-h">Choose Your Reveal Experience</h2>
      <ul className="exp-cards">
        {cards.map((c) => (
          <li key={c.key} className={`exp-card${shown === c.key ? ' is-shown' : ''}`}>
            <img className="exp-thumb" src={thumbFor(c.key)} alt="" width="320" height="240" loading="lazy" />
            <div className="exp-card-text">
              <h3>{c.name}</h3>
              <p className="exp-card-theme">{c.theme}</p>
            </div>
            <div className="exp-card-actions">
              <button type="button" onClick={() => onPreview(c.key)} aria-label={`Preview Experience: ${c.name}`}>Preview</button>
              <button type="button" aria-pressed={selected === c.key} onClick={() => onUse(c.key)}
                aria-label={`${selected === c.key ? 'In use' : 'Use This Experience'}: ${c.name}`}>{selected === c.key ? '✓ In use' : 'Use this'}</button>
            </div>
          </li>
        ))}
      </ul>
      <p className="exp-described">{described}</p>
    </section>
  );
}
