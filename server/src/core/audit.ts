// ============================================================
// Audit — the single writer for the activity/audit log.
//
// Wraps lib/activity.ts logActivity() and fills in what the request context
// knows: the actor, the request id and the source (HUMAN for API calls,
// SYSTEM for jobs and migrations, AI for copilot/extraction writes). Services
// call audit() inside the same transaction as the change they describe.
// ============================================================

import type { Prisma } from '@prisma/client';
import { logActivity, buildActivityTitle, type DbClient, type ActivityInput } from '../lib/activity.js';
import { getContext, type ActorSource } from './requestContext.js';

export interface AuditInput extends Omit<ActivityInput, 'userId'> {
  userId?: string | null;
  source?: ActorSource;
}

export async function audit(db: DbClient, input: AuditInput) {
  const ctx = getContext();
  return logActivity(db, {
    ...input,
    userId:    input.userId ?? ctx?.userId ?? null,
    source:    input.source ?? ctx?.source ?? 'SYSTEM',
    requestId: ctx?.requestId ?? null,
  });
}

/** Many audit rows in one statement (bulk imports). Same shape and provenance as audit(). */
export async function auditMany(db: DbClient, inputs: AuditInput[]) {
  if (!inputs.length) return { count: 0 };
  const ctx = getContext();
  const now = new Date();
  return db.activityLog.createMany({
    data: inputs.map(input => ({
      action:      input.action,
      title:       input.title ?? buildActivityTitle(input.action),
      description: input.description,
      entityType:  input.entityType,
      entityId:    input.entityId,
      userId:      input.userId ?? ctx?.userId ?? undefined,
      metadata:    (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      timestamp:   now.toISOString(),
      date:        now.toISOString().slice(0, 10),
      before:      (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after:       (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
      source:      input.source ?? ctx?.source ?? 'SYSTEM',
      requestId:   ctx?.requestId ?? undefined,
    })),
  });
}

export type { DbClient };
