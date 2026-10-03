import { Link, NavLink, Outlet } from 'react-router';
import { RequireSeller } from '../../components/guards.jsx';
import { Notice, PageHero } from '../../components/ui.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useStore } from './shared.jsx';

/** Explains what the store can do while it isn't approved. Nothing is shown for an approved store. */
function StoreStatusNotice({ store }) {
  if (!store || store.status === 'APPROVED') return null;
  if (store.status === 'PENDING') {
    return (
      <Notice tone="warn" role="status">
        <strong>Your store is waiting for approval.</strong> GiftGenius reviews every new store. Meanwhile you can prepare
        products as drafts; you can submit them for approval once your store is approved.
      </Notice>
    );
  }
  if (store.status === 'REJECTED') {
    return (
      <Notice tone="error" role="status">
        <strong>Your store wasn&apos;t approved.</strong> {store.statusReason ? <>Reason: {store.statusReason} </> : null}
        Update your details in <Link to="/seller/settings">Store Settings</Link> and apply again.
      </Notice>
    );
  }
  return (
    <Notice tone="error" role="status">
      <strong>Your store is suspended</strong> and its products are hidden from the shop.
      {store.statusReason ? <> Reason: {store.statusReason}.</> : null} Please <Link to="/contact">contact GiftGenius support</Link>.
    </Notice>
  );
}

const TABS = [
  ['/seller', '📊 Dashboard', true],
  ['/seller/products', '🎁 My Products'],
  ['/seller/orders', '📦 Orders'],
  ['/seller/analytics', '📈 Analytics'],
  ['/seller/settings', '⚙️ Store Settings'],
];

export function SellerLayout() {
  useDocumentTitle('Seller Center');
  return (
    <RequireSeller>
      <SellerShell />
    </RequireSeller>
  );
}

function SellerShell() {
  const store = useStore();
  return (
    <>
      <PageHero eyebrow="Seller Center" title={store.data?.storeName ?? 'Your'} em={store.data ? undefined : 'Store'}>
        Your products, orders and sales on GiftGenius.
      </PageHero>
      <div className="adm-page sel-page">
        <nav className="adm-tabs" aria-label="Seller Center sections">
          {TABS.map(([to, label, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
        </nav>
        <StoreStatusNotice store={store.data} />
        <Outlet />
      </div>
    </>
  );
}
