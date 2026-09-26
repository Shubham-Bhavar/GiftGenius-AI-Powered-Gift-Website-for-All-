import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import App from '../App.jsx';

/** Renders the real app (router, providers, pages) at a URL, with a fresh query cache. */
export function renderApp(path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const user = userEvent.setup();
  const utils = render(<App queryClient={queryClient} initialEntries={[path]} />);
  return { user, queryClient, ...utils };
}

/** Puts items in the guest cart exactly as the app stores them. */
export function seedGuestCart(lines) {
  localStorage.setItem('gg-cart', JSON.stringify(lines.map((l) => ({
    key: `${l.productId}||`, customName: null, customMessage: null, stock: 20, ...l,
  }))));
}
