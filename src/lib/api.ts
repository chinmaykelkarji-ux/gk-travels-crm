// ============================================================
// Typed API client for v2 modules.
//
// Wraps the axios instance (cookie auth, 401 redirect) and normalises every
// failure into ApiError, whichever shape the server used:
//   { error: { code, message, fields, requestId } }   (v2 envelope)
//   { error: "message" }                              (legacy routes)
// Feature hooks (TanStack Query) call these and never touch axios directly.
// ============================================================

import type { AxiosError } from 'axios';
import apiClient from './apiClient';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** First field error, or the message — handy for a single toast line. */
  get summary(): string {
    const first = this.fields ? Object.values(this.fields)[0] : undefined;
    return first ? `${this.message}: ${first}` : this.message;
  }
}

function toApiError(err: unknown): ApiError {
  const ax = err as AxiosError<unknown>;
  const status = ax.response?.status ?? 0;
  const data   = ax.response?.data as { error?: unknown; message?: unknown } | undefined;
  if (data && typeof data === 'object') {
    const e = data.error;
    if (e && typeof e === 'object') {
      const o = e as { code?: string; message?: string; fields?: Record<string, string>; requestId?: string };
      return new ApiError(status, o.code ?? 'ERROR', o.message ?? 'Request failed', o.fields, o.requestId);
    }
    if (typeof e === 'string') return new ApiError(status, status === 403 ? 'FORBIDDEN' : 'ERROR', e);
    if (typeof data.message === 'string') return new ApiError(status, 'ERROR', data.message);
  }
  if (!ax.response) return new ApiError(0, 'NETWORK', 'Could not reach the server. Check your connection and try again.');
  return new ApiError(status, 'ERROR', ax.message || 'Request failed');
}

async function run<T>(p: Promise<{ data: T }>): Promise<T> {
  try {
    return (await p).data;
  } catch (err) {
    throw toApiError(err);
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export const api = {
  get:    <T>(path: string, params?: Query) => run<T>(apiClient.get<T>(path, { params: compact(params) })),
  post:   <T>(path: string, body?: unknown) => run<T>(apiClient.post<T>(path, body)),
  put:    <T>(path: string, body?: unknown) => run<T>(apiClient.put<T>(path, body)),
  patch:  <T>(path: string, body?: unknown) => run<T>(apiClient.patch<T>(path, body)),
  delete: <T>(path: string) => run<T>(apiClient.delete<T>(path)),
};

function compact(params?: Query): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') out[k] = v;
  return out;
}

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
