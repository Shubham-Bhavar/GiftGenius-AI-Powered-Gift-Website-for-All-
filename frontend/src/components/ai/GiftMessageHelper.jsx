import { useState } from 'react';
import { ErrorNote } from '../common/ui.jsx';
import { aiApi } from '../../services/ai.js';
import { titleCase } from '../../utils/format.js';

/**
 * "Help me write the message" on the product page: GiftGenius AI suggests gift-card messages for this
 * product; picking one fills the card message box (via onPick).
 */
export function GiftMessageHelper({ product, onPick }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ recipient: '', occasion: '', tone: 'warm', senderName: '' });
  const [state, setState] = useState({ busy: false, messages: null, source: null, error: null });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!open) {
    return <button type="button" className="pd-ai-link" onClick={() => setOpen(true)}>✨ Help me write the message with GiftGenius AI</button>;
  }
  const generate = async () => {
    setState({ busy: true, messages: null, source: null, error: null });
    try {
      const res = await aiApi.giftMessages({ ...form, productName: product.name });
      setState({ busy: false, messages: res.messages, source: res.source, error: null });
    } catch (err) {
      setState({ busy: false, messages: null, source: null, error: err });
    }
  };
  return (
    <div className="pd-ai-box">
      <div className="pd-ai-grid">
        <label>For
          <select className="pd-input" value={form.recipient} onChange={set('recipient')}>
            <option value="">Someone special</option>
            {['partner', 'mother', 'father', 'friend', 'sibling', 'colleague'].map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
          </select>
        </label>
        <label>Occasion
          <select className="pd-input" value={form.occasion} onChange={set('occasion')}>
            <option value="">Just because</option>
            {(product.occasion?.length ? product.occasion : ['birthday', 'anniversary']).map((o) => <option key={o} value={o}>{titleCase(o)}</option>)}
          </select>
        </label>
        <label>Tone
          <select className="pd-input" value={form.tone} onChange={set('tone')}>
            {['warm', 'funny', 'romantic', 'formal', 'poetic'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </select>
        </label>
        <label>Signed by
          <input className="pd-input" maxLength={60} placeholder="Optional" value={form.senderName} onChange={set('senderName')} />
        </label>
      </div>
      <button type="button" className="btn-outline btn-sm" disabled={state.busy} onClick={generate}>
        {state.busy ? 'Writing…' : '✨ Suggest messages'}
      </button>
      <ErrorNote error={state.error} />
      {state.messages && (
        <ul className="pd-ai-list">
          {state.messages.map((m) => <li key={m}><button type="button" onClick={() => onPick(m)}>{m}</button></li>)}
          <li className="pd-ai-note">{state.source === 'ai' ? 'Written by GiftGenius AI. ' : ''}Tap one to use it — you can edit it after.</li>
        </ul>
      )}
    </div>
  );
}
