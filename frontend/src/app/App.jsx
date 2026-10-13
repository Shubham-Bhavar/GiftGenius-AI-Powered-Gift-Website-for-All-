import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createBrowserRouter, createMemoryRouter } from 'react-router';
import { AuthProvider } from '../context/AuthContext.jsx';
import { CartProvider } from '../context/CartContext.jsx';
import { SearchProvider } from '../context/SearchContext.jsx';
import { ToastProvider } from '../context/ToastContext.jsx';
import { UiProvider } from '../context/UiContext.jsx';
import { WishlistProvider } from '../context/WishlistContext.jsx';
import { createQueryClient } from './queryClient.js';
import { routes } from './routes.jsx';

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
