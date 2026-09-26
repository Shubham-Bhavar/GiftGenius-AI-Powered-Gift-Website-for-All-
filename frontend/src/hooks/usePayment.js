import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { payWithRazorpay } from '../lib/razorpay.js';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

/**
 * Opens Razorpay for an order awaiting payment and verifies the result with the server.
 * Resolves to 'paid', 'dismissed' or 'failed'. The server webhook also confirms payments,
 * so a shopper who closes the tab mid-payment is still covered.
 */
export function usePayment() {
  const qc = useQueryClient();
  const cart = useCart();
  const toast = useToast();

  return useCallback(
    async (order) => {
      try {
        const result = await payWithRazorpay(order.orderNumber, order.payment);
        if (!result) {
          toast('Payment not completed. You can pay any time from My orders within 30 minutes.', 'warn');
          return 'dismissed';
        }
        const updated = await api.verifyPayment(order.orderNumber, result);
        qc.setQueryData(['orders', order.orderNumber], updated);
        toast('Payment received. Thank you!');
        return 'paid';
      } catch (e) {
        toast(e.message, 'bad');
        return 'failed';
      } finally {
        qc.invalidateQueries({ queryKey: ['orders'] });
        cart.refresh();
      }
    },
    [qc, cart, toast],
  );
}
