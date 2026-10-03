import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { EmptyState, ErrorNote, Field, PageHero } from '../../components/common/ui.jsx';
import { SITE } from '../../config/site.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { api } from '../../lib/api.js';

const TOPICS = [['general', 'General question'], ['order', 'Help with an order'], ['bulk', 'Bulk & corporate orders'], ['partnership', 'Partnerships']];

export function Contact() {
  useDocumentTitle('Contact Us');
  // A fresh form for every visit, including footer links (e.g. "Bulk Orders") clicked while already here.
  const { key } = useLocation();
  return <ContactForm key={key} />;
}

function ContactForm() {
  const [params] = useSearchParams();
  const toast = useToast();
  const initialTopic = TOPICS.some(([k]) => k === params.get('topic')) ? params.get('topic') : 'general';
  const [f, setF] = useState({ name: '', email: '', topic: initialTopic, orderNumber: '', message: '' });
  const [state, setState] = useState({ busy: false, error: null, errors: {}, sent: false });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: null, errors: {}, sent: false });
    try {
      await api.contact({ ...f, orderNumber: f.orderNumber.trim() || undefined });
      setState({ busy: false, error: null, errors: {}, sent: true });
      toast("Message sent — we'll reply within one working day 💌");
    } catch (err) {
      setState({ busy: false, error: err, errors: err.errors || {}, sent: false });
    }
  };

  return (
    <>
      <PageHero eyebrow="We're Here To Help" title="Get in" em="Touch">Questions about an order, bulk gifting or anything else — we reply within one working day.</PageHero>
      <div className="gg-page contact-grid">
        <aside className="contact-info">
          <div className="contact-item"><span aria-hidden="true">📧</span><div><strong>Email</strong><a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a></div></div>
          <div className="contact-item"><span aria-hidden="true">📞</span><div><strong>Phone</strong><a href={`tel:${SITE.supportPhone.replace(/\s/g, '')}`}>{SITE.supportPhone}</a></div></div>
          <div className="contact-item"><span aria-hidden="true">📍</span><div><strong>Studio</strong><span>{SITE.city}</span></div></div>
          <div className="contact-item"><span aria-hidden="true">🕙</span><div><strong>Hours</strong><span>Mon–Sat, 10 AM – 7 PM IST</span></div></div>
          <Link to="/track" className="btn-outline">📦 Track an order instead</Link>
        </aside>
        {state.sent ? (
          <div className="co-form-section">
            <EmptyState icon="💌" title="Thank you for writing to us!" action={<Link to="/" className="btn-primary">Back to the Shop →</Link>}>
              We&apos;ve received your message and will reply to {f.email} within one working day.
            </EmptyState>
          </div>
        ) : (
          <form className="co-form-section" onSubmit={submit}>
            <h2>💬 Send us a message</h2>
            <div className="co-form-row">
              <Field label="Your Name" required maxLength={120} autoComplete="name" value={f.name} onChange={set('name')} error={state.errors.name} />
              <Field label="Email" required type="email" autoComplete="email" value={f.email} onChange={set('email')} error={state.errors.email} />
            </div>
            <div className="co-form-row">
              <Field label="Topic" as="select" value={f.topic} onChange={set('topic')}>
                {TOPICS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Field>
              <Field label="Order ID (optional)" maxLength={20} placeholder="GG-XXXXXXXX" value={f.orderNumber}
                onChange={(e) => setF((s) => ({ ...s, orderNumber: e.target.value.toUpperCase() }))} error={state.errors.orderNumber} />
            </div>
            <div className="co-form-row full">
              <Field label="Message" as="textarea" rows={6} required minLength={10} maxLength={2000} value={f.message} onChange={set('message')}
                error={state.errors.message} hint={f.topic === 'bulk' ? 'Tell us the quantity, budget per gift and delivery date.' : `${f.message.length}/2000`} />
            </div>
            <ErrorNote error={Object.keys(state.errors).length ? null : state.error} />
            <button className="btn-primary" disabled={state.busy}>{state.busy ? 'Sending…' : 'Send Message →'}</button>
          </form>
        )}
      </div>
    </>
  );
}
