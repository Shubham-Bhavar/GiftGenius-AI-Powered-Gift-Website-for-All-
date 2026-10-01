import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { payWithRazorpay } from '../lib/razorpay.js';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

const retryable = (e) => e?.status === 0 || e?.status >= 500;

/** Confirms with the server, riding out a brief network blip or restart (the payment itself is already made). */
async function verify(orderNumber, result) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await api.verifyPayment(orderNumber, result);
    } catch (e) {
      if (!retryable(e) || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
}

/**
 * Opens Razorpay for an order awaiting payment and verifies the result with the server.
 * Resolves to 'paid', 'dismissed', 'failed', 'confirming' (paid, but the server couldn't be reached
 * to confirm it yet) or 'refund' (the order was cancelled while the payment was in flight).
 * The server webhook also confirms payments, so a shopper who closes the tab mid-payment is covered.
 */
export function usePayment() {
  const qc = useQueryClient();
  const cart = useCart();
  const toast = useToast();

  return useCallback(
    async (order, method) => {
      try {
        let result;
        try {
          result = await payWithRazorpay(order.orderNumber, order.payment, method);
        } catch (e) {
          toast(`${e.message.replace(/\.?$/, '.')} Your order is saved, so you can try again from My orders within 30 minutes.`, 'bad');
          return 'failed';
        }
        if (!result) {
          toast('Payment not completed. You can pay any time from My orders within 30 minutes.', 'warn');
          return 'dismissed';
        }
        try {
          const updated = await verify(order.orderNumber, result);
          qc.setQueryData(['orders', order.orderNumber], updated);
          if (updated.paymentStatus === 'PAID') {
            toast('Payment received. Thank you!');
            return 'paid';
          }
          toast('This order was cancelled before your payment went through, so the payment will be refunded.', 'warn');
          return 'refund';
        } catch (e) {
          if (retryable(e)) {
            toast("Razorpay has your payment. We're confirming it, and your order will update in a moment.", 'warn');
            return 'confirming';
          }
          toast(e.message, 'bad');
          return 'failed';
        }
      } finally {
        qc.invalidateQueries({ queryKey: ['orders'] });
        cart.refresh();
      }
    },
    [qc, cart, toast],
  );
}
