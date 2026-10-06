import { Link } from 'react-router';
import { PageHero, SecHeader } from '../../components/common/ui.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { Reveal } from '../../animations/Reveal.jsx';

export function About() {
  useDocumentTitle('About Us');
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
      <Reveal>
        <section className="features" aria-label="What we promise">
          <div className="feat-item"><div className="feat-ico" aria-hidden="true">✨</div><div className="feat-text"><strong>AI Gift Advisor</strong><span>Picks with reasons, in seconds</span></div></div>
          <div className="feat-item"><div className="feat-ico" aria-hidden="true">🎀</div><div className="feat-text"><strong>Hand-Wrapped</strong><span>Every order, with a card</span></div></div>
          <div className="feat-item"><div className="feat-ico" aria-hidden="true">🚀</div><div className="feat-text"><strong>Fast Delivery</strong><span>Same-day in Mumbai</span></div></div>
          <div className="feat-item"><div className="feat-ico" aria-hidden="true">🔒</div><div className="feat-text"><strong>Secure Checkout</strong><span>Razorpay or cash on delivery</span></div></div>
        </section>
      </Reveal>
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
