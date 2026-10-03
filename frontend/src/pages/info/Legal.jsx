import { Link } from 'react-router';
import { PageHero } from '../../components/common/ui.jsx';
import { SITE } from '../../config/site.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

// The legal pages, sharing one layout.

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
