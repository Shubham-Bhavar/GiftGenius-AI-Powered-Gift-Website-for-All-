import { dateTime } from '../lib/format.js';

/** The track page's journey (placed → payment → packed → shipped → out for delivery → delivered). */
const STEPS = [
  { key: 'PLACED', icon: '🧾', title: 'Order Placed', desc: 'Your order was received and confirmed.' },
  { key: 'PAID', icon: '💳', title: 'Payment Confirmed', desc: 'Payment received.' },
  { key: 'PACKED', icon: '🎀', title: 'Packing & Gift Wrapping', desc: 'Your gift is being lovingly packed with a personalised card.' },
  { key: 'SHIPPED', icon: '🚚', title: 'Shipped', desc: 'Handed to our delivery partner.' },
  { key: 'OUT_FOR_DELIVERY', icon: '📦', title: 'Out for Delivery', desc: 'Your gift is on its way to you!' },
  { key: 'DELIVERED', icon: '🎁', title: 'Delivered', desc: 'Your gift has arrived safely.' },
];

function eventFor(key, timeline) {
  if (key === 'PLACED') return timeline.find((e) => e.status === 'CONFIRMED' || e.status === 'PENDING_PAYMENT');
  if (key === 'PAID') return timeline.find((e) => e.status === 'CONFIRMED');
  return timeline.find((e) => e.status === key);
}

export default function OrderTimeline({ status, timeline, paymentMethod, paymentStatus }) {
  if (status === 'CANCELLED') {
    const cancelled = timeline.find((e) => e.status === 'CANCELLED');
    return (
      <div className="timeline">
        <div className="t-item done">
          <div className="t-dot">✓</div>
          <div className="t-title">Order Placed</div>
          <div className="t-time">{dateTime(timeline[0]?.at)}</div>
        </div>
        <div className="t-item cancelled">
          <div className="t-dot">✕</div>
          <div className="t-title">Cancelled</div>
          <div className="t-desc">{cancelled?.note || 'This order was cancelled.'}</div>
          <div className="t-time">{dateTime(cancelled?.at)}</div>
        </div>
      </div>
    );
  }
  // Cash-on-delivery orders are paid at the door, so the payment step moves to the end.
  const steps = paymentMethod === 'COD'
    ? STEPS.filter((s) => s.key !== 'PAID')
    : STEPS;
  const reached = steps.map((s) => {
    if (s.key === 'PAID') return paymentStatus === 'PAID' || paymentStatus === 'REFUND_PENDING';
    return !!eventFor(s.key, timeline);
  });
  const lastDone = reached.lastIndexOf(true);
  return (
    <div className="timeline">
      {steps.map((s, i) => {
        const done = reached[i];
        const current = i === lastDone + 1 && status !== 'DELIVERED';
        const ev = eventFor(s.key, timeline);
        return (
          <div key={s.key} className={`t-item ${done ? 'done' : ''} ${current ? 'active' : ''}`} aria-current={current ? 'step' : undefined}>
            <div className="t-dot">{done ? '✓' : s.icon}</div>
            <div className="t-title">{s.title}</div>
            <div className="t-desc">{(ev?.note && s.key !== 'PLACED' && s.key !== 'PAID') ? ev.note : s.desc}</div>
            <div className="t-time">{done ? dateTime(ev?.at) || 'Done' : current ? (status === 'PENDING_PAYMENT' ? 'Waiting for payment' : 'In progress') : 'Pending'}</div>
          </div>
        );
      })}
    </div>
  );
}
