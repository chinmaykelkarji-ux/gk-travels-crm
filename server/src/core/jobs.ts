// ============================================================
// Job runner — durable background work that survives serverless.
//
// Jobs live in the `jobs` table. Any scheduler (Vercel Cron, an external
// cron service, or the local dev loop) calls POST /api/jobs/tick; the tick
// claims jobs one at a time with SELECT … FOR UPDATE SKIP LOCKED and a lease,
// runs each handler inside its organisation's context with a time budget,
// and records success, retry (exponential backoff) or final failure.
// Two schedulers firing at once cannot double-run a job; a crashed tick
// leaves a lease that expires and the job is retried.
//
// Handlers are registered by module (server/src/jobs/handlers.ts). Recurring
// system work (scheduler rules, outbox dispatch) is enqueued by the tick
// itself with per-window idempotency keys, so it runs at most once per window
// per organisation.
// ============================================================

import type { Prisma, Job, JobStatus } from '@prisma/client';
import { prisma, prismaUnscoped } from '../lib/prisma.js';
import { runWithContext, currentOrganizationId } from './requestContext.js';

export type JobPayload = Record<string, unknown>;
export interface JobContext { jobId: string; organizationId: string; attempt: number; deadline: number }
export type JobHandler = (payload: JobPayload, ctx: JobContext) => Promise<unknown>;

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}
export function hasJobHandler(type: string): boolean {
  return handlers.has(type);
}
export function registeredJobTypes(): string[] {
  return [...handlers.keys()].sort();
}

export const DEFAULT_LEASE_MS   = 5 * 60 * 1000;
export const DEFAULT_BUDGET_MS  = 20 * 1000;
export const MAX_BACKOFF_MS     = 60 * 60 * 1000;

/** 30 s, 60 s, 120 s … capped at one hour. Exported for tests. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_MS);
}

// ── Enqueue ───────────────────────────────────────────────────

export interface EnqueueInput {
  type:            string;
  payload?:        JobPayload;
  runAfter?:       Date;
  idempotencyKey?: string;
  priority?:       number;
  maxAttempts?:    number;
  organizationId?: string;
}

export interface EnqueueResult { id: string; created: boolean }

/**
 * Adds a job. With an idempotencyKey, an existing PENDING/RUNNING/SUCCEEDED
 * job with the same key is returned unchanged; a FAILED or CANCELLED one is
 * re-armed. Runs in the caller's organisation unless one is given.
 */
export async function enqueueJob(input: EnqueueInput): Promise<EnqueueResult> {
  const organizationId = input.organizationId ?? currentOrganizationId();
  const payload = (input.payload ?? {}) as Prisma.InputJsonValue;

  return runWithContext({ organizationId, source: 'SYSTEM' }, async () => {
    if (input.idempotencyKey) {
      const existing = await prisma.job.findUnique({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
      });
      if (existing) {
        if (existing.status === 'FAILED' || existing.status === 'CANCELLED') {
          await prisma.job.update({
            where: { id: existing.id },
            // runAfter is left alone when not given: the old value is in the past, so the job is claimable now.
            data:  { status: 'PENDING', attempts: 0, payload, runAfter: input.runAfter, lastError: null, lockedUntil: null, lockedBy: null, finishedAt: null },
          });
        }
        return { id: existing.id, created: false };
      }
    }
    const job = await prisma.job.create({
      data: {
        organizationId,
        type:           input.type,
        payload,
        // Omitted = database NOW() (schema default), so host/DB clock skew cannot delay a job.
        runAfter:       input.runAfter,
        idempotencyKey: input.idempotencyKey ?? null,
        priority:       input.priority ?? 0,
        maxAttempts:    input.maxAttempts ?? 3,
      },
      select: { id: true },
    });
    return { id: job.id, created: true };
  });
}

export async function cancelJob(id: string): Promise<boolean> {
  const r = await prisma.job.updateMany({
    where: { id, status: { in: ['PENDING'] } },
    data:  { status: 'CANCELLED', finishedAt: new Date() },
  });
  return r.count > 0;
}

// ── Claim + execute ───────────────────────────────────────────

async function claimOne(workerId: string, leaseMs: number): Promise<Job | null> {
  const rows = await prismaUnscoped.$queryRaw<Job[]>`
    WITH next AS (
      SELECT "id" FROM "jobs"
      WHERE ("status" = 'PENDING' AND "runAfter" <= NOW())
         OR ("status" = 'RUNNING' AND "lockedUntil" IS NOT NULL AND "lockedUntil" < NOW())
      ORDER BY "priority" DESC, "runAfter" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "jobs" j
    SET "status" = 'RUNNING',
        "lockedUntil" = NOW() + (${leaseMs} || ' milliseconds')::interval,
        "lockedBy" = ${workerId},
        "attempts" = j."attempts" + 1,
        "startedAt" = NOW(),
        "updatedAt" = NOW()
    FROM next
    WHERE j."id" = next."id"
    RETURNING j.*`;
  return rows[0] ?? null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded its time budget (${Math.round(ms / 1000)} s)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export interface TickSummary {
  claimed: number; succeeded: number; failed: number; retried: number;
  systemJobsEnqueued: number; durationMs: number; workerId: string; budgetMs: number;
}

async function executeJob(job: Job, deadline: number, summary: TickSummary): Promise<void> {
  const handler = handlers.get(job.type);
  const finishFail = async (message: string, exhausted: boolean) => {
    const lastError = message.slice(0, 2000);
    if (exhausted) {
      await prismaUnscoped.job.update({
        where: { id: job.id },
        data:  { status: 'FAILED' satisfies JobStatus, lastError, lockedUntil: null, lockedBy: null, finishedAt: new Date() },
      });
      summary.failed++;
      return;
    }
    // Backoff is computed on the database clock, like the claim query, so a
    // skewed function clock can neither delay nor rush the retry.
    await prismaUnscoped.$executeRaw`
      UPDATE "jobs"
      SET "status" = 'PENDING', "lastError" = ${lastError}, "lockedUntil" = NULL, "lockedBy" = NULL,
          "runAfter" = NOW() + (${backoffMs(job.attempts)} || ' milliseconds')::interval,
          "finishedAt" = NULL, "updatedAt" = NOW()
      WHERE "id" = ${job.id}`;
    summary.retried++;
  };

  if (!handler) {
    await finishFail(`No handler registered for job type "${job.type}"`, true);
    return;
  }

  const ctx: JobContext = { jobId: job.id, organizationId: job.organizationId, attempt: job.attempts, deadline };
  const budget = Math.max(1_000, Math.min(deadline - Date.now(), DEFAULT_LEASE_MS));
  try {
    const result = await runWithContext({ organizationId: job.organizationId, source: 'SYSTEM' }, () =>
      withTimeout(handler(job.payload as JobPayload, ctx), budget, `Job ${job.type}`));
    await prismaUnscoped.job.update({
      where: { id: job.id },
      data: {
        status:      'SUCCEEDED',
        result:      (result === undefined ? null : result) as Prisma.InputJsonValue,
        lockedUntil: null,
        lockedBy:    null,
        finishedAt:  new Date(),
        lastError:   null,
      },
    });
    summary.succeeded++;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[jobs] ${job.type} (${job.id}) attempt ${job.attempts}/${job.maxAttempts} failed: ${message}`);
    await finishFail(message, job.attempts >= job.maxAttempts);
  }
}

// ── Recurring system work ─────────────────────────────────────
// Registered handlers can declare a recurrence; the tick enqueues one job per
// active organisation per window (idempotent), so any scheduler frequency
// above the window size gives exactly-once-per-window behaviour.

export interface RecurringSpec { type: string; everyMs: number; priority?: number }
const recurring: RecurringSpec[] = [];

export function registerRecurringJob(spec: RecurringSpec): void {
  recurring.push(spec);
}

async function enqueueRecurring(summary: TickSummary): Promise<void> {
  if (!recurring.length) return;
  const orgs = await prismaUnscoped.organization.findMany({ where: { isActive: true }, select: { id: true } });
  const now = Date.now();
  for (const org of orgs) {
    for (const spec of recurring) {
      const window = Math.floor(now / spec.everyMs);
      const r = await enqueueJob({
        type: spec.type, organizationId: org.id, priority: spec.priority ?? -10,
        idempotencyKey: `${spec.type}:${window}`,
      });
      if (r.created) summary.systemJobsEnqueued++;
    }
  }
}

// ── Tick ──────────────────────────────────────────────────────

export interface TickOptions { budgetMs?: number; workerId?: string; maxJobs?: number; leaseMs?: number; skipRecurring?: boolean }

export async function runTick(opts: TickOptions = {}): Promise<TickSummary> {
  const started  = Date.now();
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const deadline = started + budgetMs;
  const workerId = opts.workerId ?? `tick-${process.pid}-${started.toString(36)}`;
  const maxJobs  = opts.maxJobs ?? 100;
  const summary: TickSummary = { claimed: 0, succeeded: 0, failed: 0, retried: 0, systemJobsEnqueued: 0, durationMs: 0, workerId, budgetMs };

  if (!opts.skipRecurring) await enqueueRecurring(summary);

  while (Date.now() < deadline && summary.claimed < maxJobs) {
    const job = await claimOne(workerId, opts.leaseMs ?? DEFAULT_LEASE_MS);
    if (!job) break;
    summary.claimed++;
    await executeJob(job, deadline, summary);
  }

  summary.durationMs = Date.now() - started;
  return summary;
}
