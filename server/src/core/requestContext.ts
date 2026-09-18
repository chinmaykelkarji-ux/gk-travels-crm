// ============================================================
// Request context — who is acting, for which organisation, in which request.
//
// Stored in AsyncLocalStorage so services, the tenant-scoped Prisma client
// and the audit writer can read it without threading `req` through every
// call. Background jobs and scripts create a context explicitly with
// runWithContext() (source SYSTEM) or runAsOrganization().
// ============================================================

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export type ActorSource = 'HUMAN' | 'SYSTEM' | 'AI';

export interface RequestContext {
  requestId:       string;
  source:          ActorSource;
  userId?:         string;
  userRole?:       string;
  organizationId?: string;
}

// One store per process, even if this module is loaded twice (hot reload, test
// runners that resolve ".js" and extension-less specifiers separately). Two
// stores would silently drop the tenant scope.
const globalStore = globalThis as unknown as { __travelosRequestContext?: AsyncLocalStorage<RequestContext> };
const storage = (globalStore.__travelosRequestContext ??= new AsyncLocalStorage<RequestContext>());

/** The organisation every existing row belongs to until onboarding exists. */
export const DEFAULT_ORGANIZATION_ID = process.env.DEFAULT_ORGANIZATION_ID ?? 'org_gktravels';

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function requireContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) throw new Error('No request context — wrap the call in runWithContext()');
  return ctx;
}

/** Organisation for the current call; falls back to the default single tenant. */
export function currentOrganizationId(): string {
  return storage.getStore()?.organizationId ?? DEFAULT_ORGANIZATION_ID;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

export function runWithContext<T>(ctx: Partial<RequestContext>, fn: () => T): T {
  const full: RequestContext = {
    requestId: ctx.requestId ?? randomUUID(),
    source:    ctx.source ?? 'SYSTEM',
    userId:    ctx.userId,
    userRole:  ctx.userRole,
    organizationId: ctx.organizationId ?? DEFAULT_ORGANIZATION_ID,
  };
  return storage.run(full, () => {
    const result = fn();
    // Lazy thenables (Prisma queries, deferred fetches) only start executing
    // when .then() is called. Subscribe here, inside the scope, so the work
    // and every continuation inherit this context instead of the caller's.
    if (isThenable(result)) {
      return new Promise((resolve, reject) => result.then(resolve, reject)) as unknown as T;
    }
    return result;
  });
}

/** Convenience for jobs/scripts acting for one organisation. */
export function runAsOrganization<T>(organizationId: string, fn: () => T, source: ActorSource = 'SYSTEM'): T {
  return runWithContext({ organizationId, source }, fn);
}

/** Called by requireAuth once the session is verified. */
export function setContextUser(user: { userId: string; userRole: string; organizationId?: string }): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  ctx.userId         = user.userId;
  ctx.userRole       = user.userRole;
  ctx.organizationId = user.organizationId ?? ctx.organizationId ?? DEFAULT_ORGANIZATION_ID;
}

// ── Express middleware ─────────────────────────────────────────
// Creates the context for every request and echoes the id back so a user
// can quote it from an error toast and we can find the log line.

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming  = req.header('x-request-id');
  const requestId = incoming && /^[\w.-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', requestId);
  storage.run({ requestId, source: 'HUMAN' }, () => next());
}
