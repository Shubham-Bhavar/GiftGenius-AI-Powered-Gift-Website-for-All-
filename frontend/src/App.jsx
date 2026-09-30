import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createBrowserRouter, createMemoryRouter } from 'react-router';
import Layout from './components/Layout.jsx';
import { RequireAuth, RouteError, SellEntry } from './components/guards.jsx';
import { Spinner } from './components/ui.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CartProvider } from './context/CartContext.jsx';
import { SearchProvider } from './context/SearchContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { UiProvider } from './context/UiContext.jsx';
import { WishlistProvider } from './context/WishlistContext.jsx';
import Home from './pages/Home.jsx';
import Shop from './pages/Shop.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Track from './pages/Track.jsx';
import Wishlist from './pages/Wishlist.jsx';
import Account from './pages/Account.jsx';
import { AuthPage, ResetPassword } from './pages/Auth.jsx';
import { About, Collections, Contact, Help, NotFound, Privacy, Terms } from './pages/Info.jsx';

const admin = () => import('./pages/admin/Admin.jsx');
const seller = () => import('./pages/seller/Seller.jsx');

export const routes = [
  {
    element: <Layout />,
    errorElement: <RouteError />,
    hydrateFallbackElement: <Spinner />,
    children: [
      { index: true, element: <Home /> },
      { path: 'shop', element: <Shop /> },
      { path: 'product/:id', element: <Product /> },
      { path: 'gift-finder', lazy: () => import('./pages/GiftFinder.jsx').then((m) => ({ Component: m.default })) },
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
      { path: 'store/:slug', lazy: () => import('./pages/Store.jsx').then((m) => ({ Component: m.default })) },
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

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        // Retry network blips and server errors, never client errors (404, 401…).
        retry: (count, error) => count < 2 && !(error?.status >= 400 && error?.status < 500),
      },
    },
  });
}

/** The whole app. Tests pass a memory-router location; the browser uses real URLs. */
export default function App({ queryClient, initialEntries }) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  const [router] = useState(() =>
    initialEntries ? createMemoryRouter(routes, { initialEntries }) : createBrowserRouter(routes));
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>
              <SearchProvider>
                <UiProvider>
                  <RouterProvider router={router} />
                </UiProvider>
              </SearchProvider>
            </WishlistProvider>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
