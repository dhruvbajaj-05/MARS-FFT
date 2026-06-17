import axios from 'axios';

import type { ApiErrorBody } from '@/api/types';

// A normalized error every screen/hook can rely on, regardless of failure mode.
export class ApiError extends Error {
  status: number;
  code: string;
  isNetwork: boolean;

  constructor(message: string, opts: { status?: number; code?: string; isNetwork?: boolean } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status ?? 0;
    this.code = opts.code ?? 'unknown';
    this.isNetwork = opts.isNetwork ?? false;
  }
}

// Convert any thrown value (axios error, network failure, etc.) into an ApiError
// with a user-presentable message and the backend's machine-readable `error` code.
export function normalizeError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (axios.isAxiosError(err)) {
    if (err.response) {
      const body = err.response.data as Partial<ApiErrorBody> | undefined;
      return new ApiError(body?.message ?? 'Request failed', {
        status: err.response.status,
        code: body?.error ?? 'http_error',
      });
    }
    // No response → network/timeout (common on weak factory connections).
    return new ApiError('Network unavailable. Check your connection and retry.', {
      isNetwork: true,
      code: 'network_error',
    });
  }

  return new ApiError(err instanceof Error ? err.message : 'Something went wrong');
}

// Friendly, role-agnostic message for an ApiError (screens may override).
export function friendlyMessage(error: ApiError): string {
  if (error.isNetwork) return 'No connection. Please retry when you are back online.';
  if (error.status === 401) return 'Your session has expired. Please log in again.';
  if (error.status === 403) return 'You do not have access to this resource.';
  if (error.status === 404) return 'Not found.';
  if (error.status >= 500) return 'Server error. Please try again shortly.';
  return error.message;
}
