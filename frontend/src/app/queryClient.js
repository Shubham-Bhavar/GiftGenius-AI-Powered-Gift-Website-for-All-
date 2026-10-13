import { QueryClient } from '@tanstack/react-query';

// Server-data cache defaults for the whole app.

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
