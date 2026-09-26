// ============================================================
// Principals whose permissions live in the database, not in code:
//
//   custom:<id>   a user with a role the owner made (access_roles)
//   apikey:<id>   another system reading through an API key (api_keys)
//
// requireAuth loads the principal (at most once a minute per process) before
// any check runs, so `hasPermission()` stays synchronous and every existing
// check — routes, copilot tools, redaction, insights — honours custom roles
// and keys without knowing about them. An unknown or unloaded principal has
// no permissions at all.
// ============================================================

import { prismaUnscoped } from '../lib/prisma.js';

const TTL_MS = 60_000;
interface Entry { perms: Set<string>; organizationId: string; loadedAt: number }
const cache = new Map<string, Entry>();

export const isPrincipalKey = (role: string | null | undefined): role is string => !!role && /^(custom|apikey):[a-z0-9]+$/i.test(role);

export function permissionsOf(key: string): Set<string> | null {
  return cache.get(key)?.perms ?? null;
}

/** Loads (or refreshes) a principal's permissions. Returns null when it no longer exists or is switched off. */
export async function loadPrincipal(key: string): Promise<Entry | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.loadedAt < TTL_MS) return hit;
  const [kind, id] = key.split(':');
  let row: { permissions: unknown; organizationId: string } | null = null;
  if (kind === 'custom') row = await prismaUnscoped.accessRole.findUnique({ where: { id }, select: { permissions: true, organizationId: true } });
  if (kind === 'apikey') {
    const k = await prismaUnscoped.apiKey.findUnique({ where: { id }, select: { permissions: true, organizationId: true, revokedAt: true, expiresAt: true } });
    row = k && !k.revokedAt && (!k.expiresAt || k.expiresAt.getTime() > Date.now()) ? k : null;
  }
  if (!row) { cache.delete(key); return null; }
  const perms = new Set((Array.isArray(row.permissions) ? row.permissions : []).filter((p): p is string => typeof p === 'string' && p !== '*'));
  const entry = { perms, organizationId: row.organizationId, loadedAt: Date.now() };
  cache.set(key, entry);
  return entry;
}

/** Called when a role or key changes, so this process sees it at once (others within a minute). */
export function forgetPrincipal(key: string): void { cache.delete(key); }
