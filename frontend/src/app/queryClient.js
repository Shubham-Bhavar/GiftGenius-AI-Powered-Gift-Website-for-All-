import { QueryClient } from '@tanstack/react-query';

// Server-data cache defaults for the whole app.

/**
 * Retry network blips and server errors (up to twice), never client errors (404, 401…). A request that hit the time
 * limit is tried once more only: by then a sleeping server has had time to start, and a third long wait would leave
 * the page loading for well over five minutes.
 */
export function shouldRetry(failureCount, error) {
  if (error?.timedOut) return failureCount < 1;
  return failureCount < 2 && !(error?.status >= 400 && error?.status < 500);
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
      },
    },
  });
}
