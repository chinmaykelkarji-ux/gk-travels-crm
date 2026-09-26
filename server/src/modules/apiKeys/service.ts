// ============================================================
// API keys — another system reading TravelOS (Phase 9.2).
//
//   tos_<prefix>_<secret>   the prefix finds the key; only the SHA-256 of
//                           the secret is kept, and the key is shown once
//
// A key is read-only by construction: it may only be given ":read"
// permissions, it is accepted only on GET requests under /api/v2, and it
// acts as the principal apikey:<id> through the same permission check as
// everyone else (core/principals.ts). Revoking or lapsing ends it at once.
// ============================================================

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ApiKey } from '@prisma/client';
import { prisma, prismaUnscoped } from '../../lib/prisma.js';
import { ROLE_PERMISSIONS } from '../../lib/permissions.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound } from '../../core/errors.js';
import { forgetPrincipal } from '../../core/principals.js';
import { permissionLabel } from '../../../../src/shared/contracts/roles.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const KEY_PATTERN = /^tos_([a-z0-9]{8})_([A-Za-z0-9_-]{40,60})$/;

/** What a key may be given: reading, nothing else. */
export function readCatalogue() {
  return [...new Set(Object.values(ROLE_PERMISSIONS).flat())].filter(p => p.endsWith(':read')).sort().map(key => ({ key, label: permissionLabel(key) }));
}

export function keyView(k: ApiKey) {
  const state = k.revokedAt ? 'REVOKED' : k.expiresAt && k.expiresAt.getTime() < Date.now() ? 'EXPIRED' : 'ACTIVE';
  return {
    id: k.id, name: k.name, prefix: `tos_${k.prefix}_…`, permissions: k.permissions as string[], state,
    expiresAt: k.expiresAt?.toISOString() ?? null, lastUsedAt: k.lastUsedAt?.toISOString() ?? null, useCount: k.useCount, createdAt: k.createdAt.toISOString(),
  };
}

export async function listKeys() {
  return { items: (await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } })).map(keyView), catalogue: readCatalogue() };
}

export async function createKey(input: { name: string; permissions: string[]; days: number | null }, actorId?: string | null) {
  const allowed = new Set(readCatalogue().map(c => c.key));
  const bad = input.permissions.filter(p => !allowed.has(p));
  if (bad.length || !input.permissions.length) throw new AppError('VALIDATION_ERROR', 400, bad.length ? `A key can only read: ${bad.join(', ')} cannot be given` : 'Choose what the key may read');
  const prefix = randomBytes(6).toString('hex').slice(0, 8);
  const secret = randomBytes(36).toString('base64url');
  const k = await prisma.$transaction(async tx => {
    const row = await tx.apiKey.create({
      data: { name: input.name, prefix, secretHash: sha(secret), permissions: [...new Set(input.permissions)].sort(), expiresAt: input.days ? new Date(Date.now() + input.days * 86_400_000) : null, createdById: actorId ?? null },
    });
    await audit(tx, { action: 'api_key_created', entityType: 'api_key', entityId: row.id, userId: actorId, description: `API key "${row.name}" made (read: ${(row.permissions as string[]).join(', ')})` });
    return row;
  });
  return { key: `tos_${prefix}_${secret}`, apiKey: keyView(k) };
}

export async function revokeKey(id: string, actorId?: string | null) {
  const k = await prisma.apiKey.findUnique({ where: { id } });
  if (!k) throw notFound('API key');
  const row = k.revokedAt ? k : await prisma.$transaction(async tx => {
    const r = await tx.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit(tx, { action: 'api_key_revoked', entityType: 'api_key', entityId: id, userId: actorId, description: `API key "${k.name}" revoked` });
    return r;
  });
  forgetPrincipal(`apikey:${id}`);
  return keyView(row);
}

/** The key behind an Authorization header, or null. Found across organisations; the key names its own. */
export async function authenticateKey(presented: string): Promise<ApiKey | null> {
  const m = KEY_PATTERN.exec(presented);
  if (!m) return null;
  const k = await prismaUnscoped.apiKey.findUnique({ where: { prefix: m[1] } });
  if (!k || k.revokedAt || (k.expiresAt && k.expiresAt.getTime() < Date.now())) return null;
  const a = Buffer.from(sha(m[2])); const b = Buffer.from(k.secretHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  // Counted at most once a minute, to keep reads cheap.
  if (!k.lastUsedAt || Date.now() - k.lastUsedAt.getTime() > 60_000) {
    await prismaUnscoped.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date(), useCount: { increment: 1 } } });
  }
  return k;
}
