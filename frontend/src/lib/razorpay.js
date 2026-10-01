const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading = null;

function loadScript() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay unavailable')));
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Opens Razorpay Checkout for an order's payment instructions, on the shopper's chosen method
 * ('upi', 'card' or 'netbanking') when given.
 * Resolves with { razorpayOrderId, razorpayPaymentId, razorpaySignature } when paid, or null if the
 * shopper closes the window without trying. A failed attempt (a declined card, a UPI request that
 * timed out) leaves the window open for a retry, so it only rejects if they then close it.
 */
export async function payWithRazorpay(orderNumber, payment, method) {
  const Razorpay = await loadScript();
  return new Promise((resolve, reject) => {
    let lastFailure = null;
    const rzp = new Razorpay({
      key: payment.keyId,
      order_id: payment.razorpayOrderId,
      amount: payment.amountPaise,
      currency: payment.currency,
      name: 'GiftGenius',
      description: `Order ${orderNumber}`,
      prefill: { name: payment.name, email: payment.email, contact: payment.phone, ...(method ? { method } : {}) },
      theme: { color: '#3A8F98' },
      handler: (r) =>
        resolve({
          razorpayOrderId: r.razorpay_order_id,
          razorpayPaymentId: r.razorpay_payment_id,
          razorpaySignature: r.razorpay_signature,
        }),
      modal: {
        ondismiss: () => (lastFailure ? reject(new Error(lastFailure)) : resolve(null)),
        confirm_close: true,
      },
    });
    rzp.on('payment.failed', (r) => {
      lastFailure = r?.error?.description || 'The payment failed.';
    });
    rzp.open();
  });
}
