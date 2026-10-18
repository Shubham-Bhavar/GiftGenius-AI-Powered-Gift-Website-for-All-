import Layout from '../components/layout/Layout.jsx';
import { RequireAuth, RouteError, SellEntry } from '../components/auth/guards.jsx';
import { Spinner } from '../components/common/ui.jsx';
import Home from '../pages/home/Home.jsx';
import Shop from '../pages/shop/Shop.jsx';
import Product from '../pages/product/Product.jsx';
import { NotFound } from '../pages/info/NotFound.jsx';

// Every URL in the site and the screen it shows. Home, Shop and Product are in the first download; every other
// page loads the first time it is visited (Admin and Seller Center as one chunk each).

/** A lazily loaded page: its module's default export, or the named one picked. */
const page = (load, pick = (m) => m.default) => () => load().then((m) => ({ Component: pick(m) }));
/** The same, behind sign-in. */
const signedIn = (load, pick = (m) => m.default) => () => load().then((m) => {
  const Page = pick(m);
  return { element: <RequireAuth><Page /></RequireAuth> };
});

const admin = () => import('../pages/admin/index.js');
const seller = () => import('../pages/seller/index.js');
const auth = () => import('../pages/auth/Auth.jsx');

export const routes = [
  {
    element: <Layout />,
    errorElement: <RouteError />,
    hydrateFallbackElement: <Spinner />,
    children: [
      { index: true, element: <Home /> },
      { path: 'shop', element: <Shop /> },
      { path: 'product/:id', element: <Product /> },
      { path: 'gift-finder', lazy: () => import('../pages/ai/GiftFinder.jsx').then((m) => ({ Component: m.default })) },
      { path: 'collections', lazy: page(() => import('../pages/shop/Collections.jsx'), (m) => m.Collections) },
      { path: 'about', lazy: page(() => import('../pages/info/About.jsx'), (m) => m.About) },
      { path: 'contact', lazy: page(() => import('../pages/info/Contact.jsx'), (m) => m.Contact) },
      { path: 'help', lazy: page(() => import('../pages/info/Help.jsx'), (m) => m.Help) },
      { path: 'privacy', lazy: page(() => import('../pages/info/Legal.jsx'), (m) => m.Privacy) },
      { path: 'terms', lazy: page(() => import('../pages/info/Legal.jsx'), (m) => m.Terms) },
      { path: 'cart', lazy: page(() => import('../pages/cart/Cart.jsx')) },
      { path: 'checkout', lazy: signedIn(() => import('../pages/checkout/Checkout.jsx')) },
      { path: 'wishlist', lazy: page(() => import('../pages/wishlist/Wishlist.jsx')) },
      { path: 'track', lazy: page(() => import('../pages/orders/Track.jsx')) },
      { path: 'login', lazy: () => auth().then((m) => ({ element: <m.AuthPage mode="login" /> })) },
      { path: 'register', lazy: () => auth().then((m) => ({ element: <m.AuthPage mode="register" /> })) },
      { path: 'forgot-password', lazy: () => auth().then((m) => ({ element: <m.AuthPage mode="forgot" /> })) },
      { path: 'reset-password', lazy: page(auth, (m) => m.ResetPassword) },
      { path: 'account', lazy: signedIn(() => import('../pages/account/Account.jsx')) },
      { path: 'account/orders', lazy: signedIn(() => import('../pages/orders/Orders.jsx')) },
      { path: 'account/orders/:number', lazy: signedIn(() => import('../pages/orders/OrderDetail.jsx')) },
      { path: 'sell', element: <SellEntry /> },
      { path: 'store/:slug', lazy: () => import('../pages/shop/Store.jsx').then((m) => ({ Component: m.default })) },
      {
        path: 'seller',
        lazy: () => seller().then((m) => ({ Component: m.SellerLayout })),
        children: [
          { index: true, lazy: () => seller().then((m) => ({ Component: m.SellerDashboard })) },
          { path: 'products', lazy: () => seller().then((m) => ({ Component: m.SellerProducts })) },
          { path: 'products/new', lazy: () => seller().then((m) => ({ Component: m.SellerProductEditor })) },
          { path: 'products/:id/edit', lazy: () => seller().then((m) => ({ Component: m.SellerProductEditor })) },
          { path: 'orders', lazy: () => seller().then((m) => ({ Component: m.SellerOrders })) },
          { path: 'orders/:number', lazy: () => seller().then((m) => ({ Component: m.SellerOrderDetail })) },
          { path: 'analytics', lazy: () => seller().then((m) => ({ Component: m.SellerAnalytics })) },
          { path: 'settings', lazy: () => seller().then((m) => ({ Component: m.SellerSettings })) },
        ],
      },
      {
        path: 'admin',
        lazy: () => admin().then((m) => ({ Component: m.AdminLayout })),
        children: [
          { index: true, lazy: () => admin().then((m) => ({ Component: m.AdminDashboard })) },
          { path: 'orders', lazy: () => admin().then((m) => ({ Component: m.AdminOrders })) },
          { path: 'products', lazy: () => admin().then((m) => ({ Component: m.AdminProducts })) },
          { path: 'coupons', lazy: () => admin().then((m) => ({ Component: m.AdminCoupons })) },
          { path: 'messages', lazy: () => admin().then((m) => ({ Component: m.AdminMessages })) },
          { path: 'sellers', lazy: () => admin().then((m) => ({ Component: m.AdminSellers })) },
          { path: 'sellers/:id', lazy: () => admin().then((m) => ({ Component: m.AdminSellerDetail })) },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
