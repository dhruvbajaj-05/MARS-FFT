import { QueryClient } from '@tanstack/react-query';

// Single react-query client for the app. Sensible defaults: don't refetch on every window
// focus, retry once, and treat data as fresh for 30s to avoid hammering the API.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
