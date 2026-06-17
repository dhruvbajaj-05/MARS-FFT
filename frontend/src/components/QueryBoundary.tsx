import React from 'react';

import { ApiError, friendlyMessage } from '@/services/apiError';
import { Loader, EmptyState, ErrorState } from './states';

interface Props<T> {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  data: T | undefined;
  onRetry?: () => void;
  isEmpty?: (data: T) => boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  children: (data: T) => React.ReactNode;
}

// Uniform Loading / Error / Empty / Success rendering for any query. Keeps every
// screen's data-state handling consistent (required by the Phase 10 spec).
export function QueryBoundary<T>({
  isLoading,
  isError,
  error,
  data,
  onRetry,
  isEmpty,
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  children,
}: Props<T>) {
  if (isLoading && data === undefined) return <Loader />;
  if (isError && data === undefined) {
    const message = error instanceof ApiError ? friendlyMessage(error) : 'Unexpected error';
    return <ErrorState message={message} onRetry={onRetry} />;
  }
  if (data === undefined) return <Loader />;
  if (isEmpty?.(data)) return <EmptyState title={emptyTitle} message={emptyMessage} />;
  return <>{children(data)}</>;
}
