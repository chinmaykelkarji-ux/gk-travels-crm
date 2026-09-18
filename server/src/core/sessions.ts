// ============================================================
// Server-side sessions — instant revocation on top of the JWT cookie.
//
// The cookie still carries a signed JWT (cheap to verify on every request),
// but the token now names a Session row (`sid`). requireAuth checks that row
// through a 60-second in-process cache, so:
//   - logout revokes just that session
//   - deactivating a user, changing their role or resetting their password
//     revokes every session they hold, and the next request is a 401
//   - sessions expire after 30 idle days (lastSeenAt is touched at most every
//     10 minutes to keep writes cheap)
// Tokens without a sid (issued before this module) are rejected, which forces
// one re-login after deployment.
// ============================================================

import { prisma } from '../lib/prisma.js';
import { runWithContext } from './requestContext.js';

export const SESSION_IDLE_DAYS = 30;
const CACHE_TTL_MS  = 60 * 1000;
const TOUCH_EVERY_MS = 10 * 60 * 1000;

interface CachedSession { userId: string; organizationId: string; expiresAt: number; revoked: boolean; checkedAt: number; lastSeenAt: number }
const cache = new Map<string, CachedSession>();

export interface SessionInfo { userId: string; organizationId: string }

export async function createSession(input: { userId: string; organizationId: string; ip?: string | null; userAgent?: string | null }): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_IDLE_DAYS * 24 * 60 * 60 * 1000);
  const session = await runWithContext({ organizationId: input.organizationId, userId: input.userId, source: 'HUMAN' }, () =>
    prisma.session.create({
      data: {
        organizationId: input.organizationId,
        userId:         input.userId,
        expiresAt,
        ip:             input.ip ?? null,
        userAgent:      input.userAgent?.slice(0, 300) ?? null,
      },
      select: { id: true },
    }),
  );
  return session.id;
}

/** Returns the session if it is live, otherwise null. Cached for 60 s. */
export async function validateSession(sid: string, organizationId: string): Promise<SessionInfo | null> {
  const now = Date.now();
  const hit = cache.get(sid);
  if (hit && now - hit.checkedAt < CACHE_TTL_MS) {
    if (hit.revoked || hit.expiresAt <= now) return null;
    void touch(sid, hit, now);
    return { userId: hit.userId, organizationId: hit.organizationId };
  }

  const row = await runWithContext({ organizationId, source: 'SYSTEM' }, () =>
    prisma.session.findUnique({
      where:  { id: sid },
      select: { userId: true, organizationId: true, expiresAt: true, revokedAt: true, lastSeenAt: true },
    }),
  );
  if (!row) { cache.delete(sid); return null; }

  const entry: CachedSession = {
    userId: row.userId, organizationId: row.organizationId,
    expiresAt: row.expiresAt.getTime(), revoked: row.revokedAt !== null,
    checkedAt: now, lastSeenAt: row.lastSeenAt.getTime(),
  };
  cache.set(sid, entry);
  if (entry.revoked || entry.expiresAt <= now) return null;
  void touch(sid, entry, now);
  return { userId: row.userId, organizationId: row.organizationId };
}

async function touch(sid: string, entry: CachedSession, now: number): Promise<void> {
  if (now - entry.lastSeenAt < TOUCH_EVERY_MS) return;
  entry.lastSeenAt = now;
  const expiresAt = new Date(now + SESSION_IDLE_DAYS * 24 * 60 * 60 * 1000);
  entry.expiresAt = expiresAt.getTime();
  try {
    await runWithContext({ organizationId: entry.organizationId, source: 'SYSTEM' }, () =>
      prisma.session.update({ where: { id: sid }, data: { lastSeenAt: new Date(now), expiresAt } }));
  } catch (err) {
    console.warn('[sessions] touch failed', (err as Error).message);
  }
}

export async function revokeSession(sid: string, organizationId: string, reason: string): Promise<void> {
  await runWithContext({ organizationId, source: 'HUMAN' }, () =>
    prisma.session.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } }));
  const hit = cache.get(sid);
  if (hit) hit.revoked = true;
}

/** Revokes every live session of a user (deactivation, role change, password reset). */
export async function revokeUserSessions(userId: string, organizationId: string, reason: string): Promise<number> {
  const result = await runWithContext({ organizationId, source: 'HUMAN' }, () =>
    prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } }));
  for (const entry of cache.values()) if (entry.userId === userId) entry.revoked = true;
  return result.count;
}

/** Test hook. */
export function clearSessionCache(): void {
  cache.clear();
}
