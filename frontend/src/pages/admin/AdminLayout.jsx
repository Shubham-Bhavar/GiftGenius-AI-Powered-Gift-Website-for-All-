import { NavLink, Outlet } from 'react-router';
import { RequireAdmin } from '../../components/guards.jsx';
import { PageHero } from '../../components/ui.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

export function AdminLayout() {
  useDocumentTitle('Store Admin');
  return (
    <RequireAdmin>
      <PageHero eyebrow="Store Admin" title="GiftGenius" em="Dashboard">Orders, products, sellers, coupons and customer messages.</PageHero>
      <div className="adm-page">
        <nav className="adm-tabs" aria-label="Admin sections">
          <NavLink to="/admin" end>📊 Dashboard</NavLink>
          <NavLink to="/admin/orders">📦 Orders</NavLink>
          <NavLink to="/admin/products">🎁 Products</NavLink>
          <NavLink to="/admin/sellers">🏪 Sellers</NavLink>
          <NavLink to="/admin/coupons">🎟️ Coupons</NavLink>
          <NavLink to="/admin/messages">💬 Messages</NavLink>
        </nav>
        <Outlet />
      </div>
    </RequireAdmin>
  );
}
