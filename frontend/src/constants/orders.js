// Order and payment states as shoppers, sellers and admins see them.

export const ORDER_STATUS = {
  PENDING_PAYMENT: { label: 'Awaiting payment', tone: 'warn' },
  CONFIRMED: { label: 'Confirmed', tone: 'info' },
  PACKED: { label: 'Packed', tone: 'info' },
  SHIPPED: { label: 'Shipped', tone: 'info' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tone: 'info' },
  DELIVERED: { label: 'Delivered', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'bad' },
};

export const PAYMENT_STATUS = {
  PENDING: 'Payment pending',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  REFUND_PENDING: 'Refund in progress',
};

export const DELIVERY_LABEL = { STANDARD: 'Standard', EXPRESS: 'Express', SAME_DAY: 'Same day' };

export const CANCELLABLE = new Set(['PENDING_PAYMENT', 'CONFIRMED', 'PACKED']);
