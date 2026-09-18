// ============================================================
// Audit — the single writer for the activity/audit log.
//
// Wraps lib/activity.ts logActivity() and fills in what the request context
// knows: the actor, the request id and the source (HUMAN for API calls,
// SYSTEM for jobs and migrations, AI for copilot/extraction writes). Services
// call audit() inside the same transaction as the change they describe.
// ============================================================

import { logActivity, type DbClient, type ActivityInput } from '../lib/activity.js';
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

export type { DbClient };
