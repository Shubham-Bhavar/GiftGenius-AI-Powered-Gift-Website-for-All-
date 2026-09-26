import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import SafeImg from '../components/SafeImg.jsx';
import { EmptyState, ErrorNote, PageHero, Pagination, PaymentPill, Spinner, StatusPill } from '../components/ui.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { api } from '../lib/api.js';
import { date, inr, orderItemsLabel } from '../lib/format.js';

export default function Orders() {
  useDocumentTitle('My Orders');
  const [page, setPage] = useState(0);
  const orders = useQuery({ queryKey: ['orders', 'list', page], queryFn: () => api.orders(page, 10), placeholderData: keepPreviousData });

  return (
    <>
      <PageHero eyebrow="Your Account" title="My" em="Orders">Track, pay for or cancel your orders.</PageHero>
      <div className="gg-page gg-page--narrow">
        {orders.isPending && <Spinner label="Loading your orders…" />}
        <ErrorNote error={orders.error} onRetry={() => orders.refetch()} />
        {orders.data?.content.length === 0 && (
          <EmptyState icon="📦" title="No orders yet" action={<Link to="/shop" className="btn-primary">Start Shopping →</Link>}>
            When you place an order, you&apos;ll find it here with live tracking.
          </EmptyState>
        )}
        <ul className="ord-list">
          {orders.data?.content.map((o) => (
            <li key={o.orderNumber}>
              <Link to={`/account/orders/${o.orderNumber}`} className="ord-row">
                <SafeImg src={o.firstItemImage} alt="" />
                <div className="ord-main">
                  <strong>{orderItemsLabel(o)}</strong>
                  <span>{o.orderNumber} · {date(o.createdAt)}</span>
                </div>
                <div className="ord-side">
                  <strong>{inr(o.total)}</strong>
                  <StatusPill status={o.status} />
                  {o.paymentStatus !== 'PAID' && o.status !== 'CANCELLED' && <PaymentPill status={o.paymentStatus} method={o.paymentMethod} orderStatus={o.status} />}
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {orders.data && <Pagination page={orders.data.page} totalPages={orders.data.totalPages} onChange={setPage} />}
      </div>
    </>
  );
}
