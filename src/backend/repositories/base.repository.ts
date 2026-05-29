// ============================================================
// GK TRAVELS CRM — Repository Helpers
//
// The Supabase client is used without a Database generic — see
// src/backend/supabase/client.ts for the reason.
// Type safety is enforced at the repository method boundary:
//   - Every create/update/findById method has an explicit return type
//   - unwrap<T>() casts the Supabase result to T at the single safe point
//   - Callers receive fully typed values with no `any` leakage
// ============================================================

// ─── Pagination ───────────────────────────────────────────────

export interface PaginatedResult<T> {
  data:       T[];
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}

export function calcRange(page: number, limit: number): { from: number; to: number } {
  return { from: (page - 1) * limit, to: (page - 1) * limit + limit - 1 };
}

// ─── Repository Error ─────────────────────────────────────────

export class RepositoryError extends Error {
  constructor(
    message:               string,
    public readonly table: string,
    public readonly op:    string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

// ─── Error helpers ────────────────────────────────────────────

export function throwRepoError(table: string, op: string, error: unknown): never {
  const msg = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as Record<string, unknown>).message)
      : 'Unknown database error';
  throw new RepositoryError(msg, table, op, error);
}

// ─── Result unwrappers ────────────────────────────────────────
// The Supabase client (without generic) returns `unknown` data.
// We cast to T at this single boundary — callers are fully typed.

export function unwrap<T>(
  result: { data: unknown; error: unknown },
  table:  string,
  op:     string,
): T {
  if (result.error)     throwRepoError(table, op, result.error);
  if (result.data === null || result.data === undefined) {
    throwRepoError(table, op, new Error('No data returned'));
  }
  return result.data as T;
}

export function unwrapNullable<T>(
  result: { data: unknown; error: unknown },
  table:  string,
  op:     string,
): T | null {
  if (result.error) throwRepoError(table, op, result.error);
  if (result.data === null || result.data === undefined) return null;
  return result.data as T;
}

export function unwrapList<T>(
  result: { data: unknown; error: unknown; count?: number | null },
  table:  string,
  op:     string,
): T[] {
  if (result.error) throwRepoError(table, op, result.error);
  if (!Array.isArray(result.data)) return [];
  return result.data as T[];
}
