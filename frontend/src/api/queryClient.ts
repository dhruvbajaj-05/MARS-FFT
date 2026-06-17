import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

import { ApiError } from '@/services/apiError';

// Tuned for factories with weak/intermittent internet: retry transient failures with
// backoff, don't retry auth/permission errors, refetch on reconnect, and persist the
// cache so the last-good data is shown instantly while offline.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60 * 1000, // keep for offline use
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = error instanceof ApiError ? error.status : 0;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
    },
    mutations: {
      retry: (failureCount, error) => {
        // Only retry network failures for idempotent-ish mutations; never auth errors.
        const isNetwork = error instanceof ApiError && error.isNetwork;
        return isNetwork && failureCount < 2;
      },
    },
  },
});

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'fft.rq.cache',
});
