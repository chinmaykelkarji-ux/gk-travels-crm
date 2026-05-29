// ============================================================
// GK TRAVELS CRM — Supabase Client
//
// Single shared instance — never create multiple clients.
// Supabase handles JWT refresh, session persistence,
// and real-time subscriptions through this client.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const isConfigured = Boolean(supabaseUrl && supabaseKey);

export function isSupabaseConfigured(): boolean {
  return isConfigured;
}

// ─── Typed transport layer ────────────────────────────────────
// We deliberately omit the Database generic here and add type safety
// at the repository boundary instead (explicit return type annotations
// on every repository method + typed unwrap helpers in base.repository.ts).
//
// WHY: @supabase/supabase-js v2.45 has undocumented constraints on the
// GenericTable type that cause any custom Database type to resolve
// Insert/Row types as `never` in its conditional type inference.
// Explicit typing at the repository boundary preserves all type safety
// that matters at call sites without fighting the generic system.
export const supabase = createClient(
  supabaseUrl  ?? 'http://localhost:54321',
  supabaseKey  ?? 'local-anon-key',
  {
    auth: {
      persistSession:    true,
      autoRefreshToken:  true,
      detectSessionInUrl: true,
      storageKey: 'gkcrm_session',
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'x-application': 'gk-travels-crm',
        'x-app-version': import.meta.env.VITE_APP_VERSION ?? '2.0.0',
      },
    },
  },
);

// ─── Dev connection test (removed automatically in prod builds) ──
if (import.meta.env.DEV) {
  supabase.auth.getSession().then(({ error }) => {
    if (error) {
      console.warn('[GK CRM] Supabase connection failed:', error.message);
    } else {
      console.log(
        '%c[GK CRM] Supabase connected',
        'color: #22c55e; font-weight: bold',
        '→', import.meta.env.VITE_SUPABASE_URL,
      );
    }
  });
}

// ─── Storage bucket names ────────────────────────────────────
export const STORAGE_BUCKETS = {
  documents: 'crm-documents',
  avatars:   'crm-avatars',
} as const;

// ─── Typed query helper ───────────────────────────────────────
// Unwraps Supabase query results and throws on error.
// Use this to convert Supabase's { data, error } into a clean throw.
export async function query<T>(
  promise: Promise<{ data: T | null; error: unknown }>,
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error;
  if (data === null) throw new Error('No data returned from query');
  return data;
}

// ─── Nullable query (returns null if no row found) ───────────
export async function queryNullable<T>(
  promise: Promise<{ data: T | null; error: unknown }>,
): Promise<T | null> {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

// ─── Mutation helper (for inserts/updates/deletes) ───────────
export async function mutate<T>(
  promise: Promise<{ data: T | null; error: unknown }>,
): Promise<T> {
  return query(promise);
}
