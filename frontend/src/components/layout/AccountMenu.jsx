import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useUi } from '../../context/UiContext.jsx';

/** The 👤 button: sign in, or the signed-in account menu (with Seller Center / Store Admin links). */
export function AccountMenu() {
  const { user, isAdmin, isSeller, logout } = useAuth();
  const { openAuth } = useUi();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!user) {
    return <button type="button" className="icon-btn" title="Account" aria-label="Sign in to your account" onClick={() => openAuth('login')}>👤</button>;
  }
  const go = (to) => { setOpen(false); navigate(to); };
  return (
    <div className="account-menu" ref={ref}>
      <button type="button" className="icon-btn icon-btn--signed" title={user.fullName} aria-haspopup="menu" aria-expanded={open}
        aria-label={`Account menu for ${user.fullName}`} onClick={() => setOpen((o) => !o)}>
        👤
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          <p className="account-who">{user.fullName}<small>{user.email}</small></p>
          <button role="menuitem" type="button" onClick={() => go('/account')}>👤 My Account</button>
          <button role="menuitem" type="button" onClick={() => go('/account/orders')}>📦 My Orders</button>
          <button role="menuitem" type="button" onClick={() => go('/wishlist')}>❤️ Wishlist</button>
          <button role="menuitem" type="button" onClick={() => go('/cart')}>🛒 Cart</button>
          {isSeller && (
            <div role="group" aria-labelledby="account-seller-h" className="account-group">
              <p id="account-seller-h" className="account-group-h">Seller Center</p>
              <button role="menuitem" type="button" onClick={() => go('/seller')}>🏪 Dashboard</button>
              <button role="menuitem" type="button" onClick={() => go('/seller/products')}>🎁 My Products</button>
              <button role="menuitem" type="button" onClick={() => go('/seller/products/new')}>➕ Add Product</button>
              <button role="menuitem" type="button" onClick={() => go('/seller/orders')}>📦 Seller Orders</button>
              <button role="menuitem" type="button" onClick={() => go('/seller/analytics')}>📈 Analytics</button>
              <button role="menuitem" type="button" onClick={() => go('/seller/settings')}>⚙️ Store Settings</button>
            </div>
          )}
          {isAdmin && (
            <div role="group" aria-labelledby="account-admin-h" className="account-group">
              <p id="account-admin-h" className="account-group-h">Store Admin</p>
              <button role="menuitem" type="button" onClick={() => go('/admin')}>🛡️ Store Admin</button>
              <button role="menuitem" type="button" onClick={() => go('/admin/sellers')}>🏪 Seller Management</button>
            </div>
          )}
          <button role="menuitem" type="button" className="account-signout" onClick={async () => {
            setOpen(false);
            navigate('/', { replace: true });
            await logout();
            toast("You're signed out. See you soon! 👋");
          }}>↩ Sign Out</button>
        </div>
      )}
    </div>
  );
}
