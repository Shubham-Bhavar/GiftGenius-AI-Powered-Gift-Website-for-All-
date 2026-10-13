import { Link } from 'react-router';
import { PageHero } from '../../components/common/ui.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

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
