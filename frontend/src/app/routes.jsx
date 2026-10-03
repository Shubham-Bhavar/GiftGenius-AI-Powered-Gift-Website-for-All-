import Layout from '../components/layout/Layout.jsx';
import { RequireAuth, RouteError, SellEntry } from '../components/auth/guards.jsx';
import { Spinner } from '../components/common/ui.jsx';
import Home from '../pages/home/Home.jsx';
import Shop from '../pages/shop/Shop.jsx';
import Product from '../pages/product/Product.jsx';
import Cart from '../pages/cart/Cart.jsx';
import Checkout from '../pages/checkout/Checkout.jsx';
import Orders from '../pages/orders/Orders.jsx';
import OrderDetail from '../pages/orders/OrderDetail.jsx';
import Track from '../pages/orders/Track.jsx';
import Wishlist from '../pages/wishlist/Wishlist.jsx';
import Account from '../pages/account/Account.jsx';
import { AuthPage, ResetPassword } from '../pages/auth/Auth.jsx';
import { About } from '../pages/info/About.jsx';
import { Collections } from '../pages/shop/Collections.jsx';
import { Contact } from '../pages/info/Contact.jsx';
import { Help } from '../pages/info/Help.jsx';
import { Privacy, Terms } from '../pages/info/Legal.jsx';
import { NotFound } from '../pages/info/NotFound.jsx';

// Every URL in the site and the screen it shows. Admin, Seller Center, the quiz and storefronts load on demand.

const admin = () => import('../pages/admin/index.js');
const seller = () => import('../pages/seller/index.js');

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
      { path: 'collections', element: <Collections /> },
      { path: 'about', element: <About /> },
      { path: 'contact', element: <Contact /> },
      { path: 'help', element: <Help /> },
      { path: 'privacy', element: <Privacy /> },
      { path: 'terms', element: <Terms /> },
      { path: 'cart', element: <Cart /> },
      { path: 'checkout', element: <RequireAuth><Checkout /></RequireAuth> },
      { path: 'wishlist', element: <Wishlist /> },
      { path: 'track', element: <Track /> },
      { path: 'login', element: <AuthPage mode="login" /> },
      { path: 'register', element: <AuthPage mode="register" /> },
      { path: 'forgot-password', element: <AuthPage mode="forgot" /> },
      { path: 'reset-password', element: <ResetPassword /> },
      { path: 'account', element: <RequireAuth><Account /></RequireAuth> },
      { path: 'account/orders', element: <RequireAuth><Orders /></RequireAuth> },
      { path: 'account/orders/:number', element: <RequireAuth><OrderDetail /></RequireAuth> },
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
