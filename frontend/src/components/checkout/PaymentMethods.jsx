import { useState } from 'react';

// Online methods all open Razorpay Checkout, which offers UPI, cards and net banking.
const PAY_METHODS = [
  { key: 'upi', label: '📱 UPI / QR Code', method: 'ONLINE' },
  { key: 'card', label: '💳 Credit / Debit Card', method: 'ONLINE' },
  { key: 'netbanking', label: '🏦 Net Banking', method: 'ONLINE' },
  { key: 'cod', label: '💰 Cash on Delivery', method: 'COD' },
];

/**
 * The shopper's payment choice at checkout.
 * UPI is the default once online payment is known to be on (the options load after the first render), until
 * the shopper picks something else. With online payment off, the order goes as cash on delivery.
 * `payKey` is the chosen method ('upi', 'card', 'netbanking' or 'cod'); Razorpay opens on that tab.
 */
export function usePaymentChoice(onlineEnabled) {
  const [chosenPayKey, setPayKey] = useState(null);
  const payKey = chosenPayKey ?? (onlineEnabled ? 'upi' : 'cod');
  const choice = PAY_METHODS.find((m) => m.key === payKey) ?? PAY_METHODS[3];
  const paymentMethod = choice.method === 'ONLINE' && !onlineEnabled ? 'COD' : choice.method;
  return { payKey, setPayKey, paymentMethod };
}

/** The "Payment Method" section of the checkout form. */
export function PaymentMethods({ payKey, onChange, onlineEnabled }) {
  return (
    <section className="co-form-section" aria-labelledby="pay-h">
      <h2 id="pay-h">💳 Payment Method</h2>
      <div className="co-pay-methods" role="radiogroup" aria-labelledby="pay-h">
        {PAY_METHODS.map((m) => {
          const disabled = m.method === 'ONLINE' && !onlineEnabled;
          return (
            <label key={m.key} className={`co-pay-method ${payKey === m.key ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}>
              <input type="radio" name="pay" value={m.key} checked={payKey === m.key} disabled={disabled} onChange={() => onChange(m.key)} />
              {m.label}
            </label>
          );
        })}
      </div>
      <p className="co-muted">
        🔒 {onlineEnabled ? 'Online payments are processed securely by Razorpay.' : 'Online payment is unavailable right now — pay by cash or UPI on delivery.'}
      </p>
    </section>
  );
}
