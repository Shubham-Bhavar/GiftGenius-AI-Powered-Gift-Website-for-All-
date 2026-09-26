import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CategoryIcon, OCCASION_CARDS } from '../components/occasions.jsx';
import { EmptyState, ErrorNote, Field, PageHero, SecHeader } from '../components/ui.jsx';
import { SITE } from '../config/site.js';
import { useToast } from '../context/ToastContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useReveal } from '../hooks/useReveal.js';
import { api } from '../lib/api.js';
import { titleCase } from '../lib/format.js';

const CATEGORY_EMOJI = {
  'gift sets': '🎁', accessories: '⌚', flowers: '🌹', fragrance: '🌺', personalized: '✍️',
  'food & sweets': '🍫', wellness: '🧘', 'home decor': '🏡', cultural: '🎨',
};

export function About() {
  useDocumentTitle('About Us');
  useReveal([]);
  return (
    <>
      <PageHero eyebrow="Our Story" title="Gifts That" em="Mean Something">
        We started GiftGenius because finding the right gift shouldn&apos;t take hours of scrolling.
      </PageHero>
      <section className="section">
        <div className="info-prose">
          <p className="info-lead">GiftGenius is India&apos;s AI-powered gift store. Tell us who you&apos;re shopping for and what the moment is — we&apos;ll help you find something they&apos;ll genuinely love, and deliver it beautifully wrapped.</p>
          <p>Every product in our catalog is hand-picked by our gifting team for quality and presentation. Our AI gift advisor doesn&apos;t invent products: it reads your answers, shortlists real, in-stock gifts that fit your budget, and explains why each one suits the person you have in mind.</p>
        </div>
      </section>
      <section className="features" aria-label="What we promise">
        <div className="feat-item"><div className="feat-ico" aria-hidden="true">✨</div><div className="feat-text"><strong>AI Gift Advisor</strong><span>Picks with reasons, in seconds</span></div></div>
        <div className="feat-item"><div className="feat-ico" aria-hidden="true">🎀</div><div className="feat-text"><strong>Hand-Wrapped</strong><span>Every order, with a card</span></div></div>
        <div className="feat-item"><div className="feat-ico" aria-hidden="true">🚀</div><div className="feat-text"><strong>Fast Delivery</strong><span>Same-day in Mumbai</span></div></div>
        <div className="feat-item"><div className="feat-ico" aria-hidden="true">🔒</div><div className="feat-text"><strong>Secure Checkout</strong><span>Razorpay or cash on delivery</span></div></div>
      </section>
      <section className="section">
        <SecHeader eyebrow="Ready?" title="Let's find their perfect gift" sub="Six quick questions, and GiftGenius AI does the rest." />
        <div className="info-cta">
          <Link to="/gift-finder" className="btn-primary">✨ Take the Gift Quiz →</Link>
          <Link to="/shop" className="btn-outline">Browse All Gifts</Link>
        </div>
      </section>
    </>
  );
}

export function Collections() {
  useDocumentTitle('Collections');
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 10 * 60_000 });
  useReveal([categories.data]);
  return (
    <>
      <PageHero eyebrow="Curated For You" title="Our" em="Collections">Shop by the moment you&apos;re celebrating, or by what they love.</PageHero>
      <section className="section cats-bg" aria-labelledby="occ-h">
        <SecHeader eyebrow="Occasions" title="Shop by Occasion" sub="Find the right gift for every meaningful moment in life" id="occ-h" />
        <div className="category-grid">
          {OCCASION_CARDS.map((c) => (
            <Link key={c.key} to={c.to} className="cat-card" aria-label={`${c.label} gifts`}>
              <CategoryIcon name={c.key} /><span>{c.label}</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="section" aria-labelledby="cat-h">
        <SecHeader eyebrow="Categories" title="Shop by Category" sub="From fresh flowers to keepsakes they'll treasure" id="cat-h" />
        <ErrorNote error={categories.error} onRetry={() => categories.refetch()} />
        <div className="coll-grid">
          {categories.data?.map((c) => (
            <Link key={c.category} to={`/shop?category=${encodeURIComponent(c.category)}`} className="coll-card reveal-on-scroll">
              <span className="coll-emoji" aria-hidden="true">{CATEGORY_EMOJI[c.category] ?? '🎁'}</span>
              <strong>{titleCase(c.category)}</strong>
              <span>{c.count} {c.count === 1 ? 'gift' : 'gifts'} →</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

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

const FAQ = [
  ['shipping', '🚚 Delivery & Shipping', [
    ['How much does delivery cost?', 'Standard delivery (3–5 days) is ₹49 and free on orders above ₹999. Express (1–2 days) is ₹99 and same-day delivery is ₹149.'],
    ['Do you deliver the same day?', 'Yes — in Mumbai, for orders placed before 2 PM. Choose “Same day” at checkout.'],
    ['Where do you deliver?', 'Across India. Enter a 6-digit pincode at checkout; we’ll let you know if it can’t be reached.'],
  ]],
  ['gift-wrapping', '🎀 Gift Wrapping & Personalisation', [
    ['Is gift wrapping free?', 'Every order is hand-wrapped in our signature paper with a satin ribbon, free of charge.'],
    ['Can I add a message?', 'Yes. Add a card message (up to 300 characters) on any product page — or let GiftGenius AI write one for you. Personalised gifts also take a name to print or engrave.'],
  ]],
  ['returns', '🔄 Returns & Cancellations', [
    ['Can I cancel my order?', 'Yes, free of charge until your gift ships. Open My Orders, choose the order and tap “Cancel order”. Paid orders are refunded to the original payment method within 5–7 working days.'],
    ['What is your return policy?', 'Unused items in their original packaging can be returned within 7 days of delivery. Perishables (flowers, food) and personalised items can’t be returned unless they arrive damaged — send us a photo within 48 hours and we’ll make it right.'],
  ]],
  ['payments', '💳 Payments', [
    ['Which payment methods do you accept?', 'UPI, credit and debit cards and net banking through Razorpay, plus cash (or UPI) on delivery.'],
    ['Are coupon codes limited?', 'Yes — each code can be used once per customer, and some have an overall limit or end date.'],
  ]],
];

export function Help() {
  useDocumentTitle('Help & FAQ');
  return (
    <>
      <PageHero eyebrow="Help Centre" title="How can we" em="help?">Answers to the questions we hear most. Still stuck? <Link to="/contact">Contact us</Link>.</PageHero>
      <div className="gg-page gg-page--narrow">
        {FAQ.map(([id, title, items]) => (
          <section key={id} id={id} className="faq-section" aria-labelledby={`${id}-h`}>
            <h2 id={`${id}-h`}>{title}</h2>
            {items.map(([q, a]) => (
              <details key={q} className="faq-item">
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </section>
        ))}
        <div className="info-cta">
          <Link to="/contact" className="btn-primary">Contact Support →</Link>
          <Link to="/track" className="btn-outline">📦 Track an Order</Link>
        </div>
      </div>
    </>
  );
}

function Legal({ title, em, updated, children }) {
  useDocumentTitle(`${title} ${em}`);
  return (
    <>
      <PageHero eyebrow="Legal" title={title} em={em}>Last updated {updated}</PageHero>
      <div className="gg-page gg-page--narrow info-prose legal">{children}</div>
    </>
  );
}

export function Privacy() {
  return (
    <Legal title="Privacy" em="Policy" updated="September 2026">
      <p>This policy explains what personal information GiftGenius collects and how we use it. <em>Store owner: review this page with your legal adviser before launch.</em></p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details</strong> — your name, email, phone number and a securely hashed password.</li>
        <li><strong>Order details</strong> — delivery addresses, the gifts you buy and your gift messages.</li>
        <li><strong>Payments</strong> — handled by Razorpay. We never see or store your card or bank details.</li>
        <li><strong>Gift finder answers</strong> — used only to recommend gifts; they may be processed by our AI provider (Google Gemini) and are not used to identify you.</li>
      </ul>
      <h2>How we use it</h2>
      <p>To deliver your orders, send order updates, reset your password, prevent fraud and — only if you subscribe — send our newsletter. We don&apos;t sell your personal information.</p>
      <h2>Cookies & storage</h2>
      <p>We use one essential, secure cookie to keep you signed in, and your browser&apos;s storage to remember your cart, wishlist and theme. We don&apos;t use advertising trackers.</p>
      <h2>Your rights</h2>
      <p>You can update your details in Account Settings, unsubscribe from emails at any time, or ask us to delete your account by writing to <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.</p>
    </Legal>
  );
}

export function Terms() {
  return (
    <Legal title="Terms of" em="Service" updated="September 2026">
      <p>By using GiftGenius you agree to these terms. <em>Store owner: review this page with your legal adviser before launch.</em></p>
      <h2>Orders & pricing</h2>
      <p>All prices are in Indian Rupees and include applicable taxes. Prices, coupons and delivery fees are confirmed at checkout. An order is accepted once you receive a confirmation email; we may cancel and fully refund an order if an item becomes unavailable.</p>
      <h2>Payments</h2>
      <p>Online payments are processed by Razorpay. Unpaid online orders are held for 30 minutes and then cancelled automatically. Cash-on-delivery orders are paid when the gift arrives.</p>
      <h2>Delivery</h2>
      <p>Delivery times are estimates. We&apos;ll keep you updated by email and on the tracking page if anything changes.</p>
      <h2>Cancellations & returns</h2>
      <p>See our <Link to="/help#returns">returns and cancellations policy</Link>.</p>
      <h2>AI recommendations</h2>
      <p>The gift finder offers suggestions to help you choose; please check each product&apos;s details before you buy.</p>
      <h2>Contact</h2>
      <p>Questions? Write to <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.</p>
    </Legal>
  );
}

export function NotFound() {
  useDocumentTitle('Page Not Found');
  const { openGiftFinder } = useUi();
  return (
    <div className="gg-page">
      <EmptyState level={1} icon="🧭" title="We couldn't find that page" action={<>
        <Link to="/" className="btn-primary">Go to the Homepage →</Link>
        <button type="button" className="btn-outline" onClick={openGiftFinder}>✨ Find a Gift</button>
      </>}>
        The link may be old, or the page has moved.
      </EmptyState>
    </div>
  );
}
