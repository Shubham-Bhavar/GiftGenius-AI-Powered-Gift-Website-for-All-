import { useState } from 'react';
import SafeImg from '../common/SafeImg.jsx';
import { ErrorNote } from '../common/ui.jsx';
import { aiApi } from '../../services/ai.js';
import { rupees, titleCase } from '../../utils/format.js';
import { MatchBadge } from '../ai/RecommendationCard.jsx';
import { THEMES, suggestThemes } from './look.js';

/**
 * Start from what you want to say ("I want to thank my sister for always supporting me"): gifts from the catalogue
 * that fit those words, and a presentation theme for them. Only what was written is used: nothing is assumed
 * about the recipient's tastes.
 */
export function MessageToGift({ onPick }) {
  const [text, setText] = useState('');
  const [state, setState] = useState({ busy: false, result: null, error: null });
  const ask = async () => {
    setState({ busy: true, result: null, error: null });
    try {
      setState({ busy: false, result: await aiApi.giftRequest({ text: text.trim(), limit: 3 }), error: null });
    } catch (error) {
      setState({ busy: false, result: null, error });
    }
  };
  const res = state.result;
  const u = res?.understood;
  const theme = res ? suggestThemes({ text, occasion: u.occasion, interests: u.interests, personality: u.personality })[0] : null;
  const understood = u ? [
    u.recipient && `For: ${u.recipient}`, u.occasion && `Occasion: ${u.occasion}`, u.budget && `Budget: ${rupees(u.budget)}`,
    u.interests?.length && `Likes: ${u.interests.join(', ')}`, u.avoid?.length && `Not: ${u.avoid.join(', ')}`,
  ].filter(Boolean) : [];

  return (
    <section className="msg-to-gift" aria-labelledby="msg-to-gift-h">
      <h2 id="msg-to-gift-h" className="studio-h">Start from what you want to say</h2>
      <label htmlFor="msg-to-gift-text" className="sr-only">What do you want the gift to say?</label>
      <textarea id="msg-to-gift-text" className="pd-input" rows={3} maxLength={500} value={text}
        placeholder="e.g. I want to thank my sister for always supporting me" onChange={(e) => setText(e.target.value)} />
      <button type="button" className="btn-primary" disabled={state.busy || !text.trim()} onClick={ask}>
        {state.busy ? 'Finding gifts…' : '💌 Find gifts for this'}
      </button>
      <ErrorNote error={state.error} onRetry={ask} />
      {res && (
        <div className="msg-to-gift-result">
          <p className="studio-hint">
            {understood.length > 0 ? `We read: ${understood.join(' · ')}.` : 'We didn’t read who it’s for or an occasion, so these fit your words alone.'}
            {' '}Nothing else is assumed about them.
          </p>
          {theme && <p className="msg-to-gift-theme">Suggested look: <strong>{THEMES[theme.theme].label}</strong>. {theme.why}.</p>}
          <ul className="msg-to-gift-picks">
            {res.picks.map((pick) => (
              <li key={pick.product.id}>
                <SafeImg src={pick.product.image} alt="" />
                <div>
                  <strong>{pick.product.name}</strong> <MatchBadge match={pick.match} />
                  <p>{titleCase(pick.product.category)} · {rupees(pick.product.price)}</p>
                  <p className="studio-hint">{pick.reason}</p>
                </div>
                <button type="button" className="studio-link-btn" onClick={() => onPick({
                  productId: pick.product.id, theme: theme?.theme, message: res.giftMessage ?? '', occasion: u.occasion,
                })}>Preview as a gift →</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
