// ============================================================
// Built-in job handlers. Importing this module registers them.
//
//   scheduler.rules  — every 15 min per organisation: payment reminders
//                      (7/3/1 days), supplier confirmation alerts, departure
//                      reminders → outbox events (idempotent per rule/day)
//   outbox.dispatch  — every minute per organisation: deliver pending outbox
//                      events (WhatsApp/email adapters; logged to message_logs)
//   identity.encrypt-legacy — every 15 min per organisation: seal identity
//                      numbers written in clear before encryption existed
//                      (a no-op once none are left)
// ============================================================

import { registerJobHandler, registerRecurringJob } from '../core/jobs.js';
import { runSchedulerRules } from '../workers/schedulerWorker.js';
import { processOutboxBatch } from '../workers/outboxWorker.js';
import { encryptLegacyIdentityBatch } from '../core/identity.js';

registerJobHandler('scheduler.rules', async () => runSchedulerRules());
registerJobHandler('outbox.dispatch', async () => processOutboxBatch());
registerJobHandler('identity.encrypt-legacy', async () => encryptLegacyIdentityBatch());

registerRecurringJob({ type: 'scheduler.rules', everyMs: 15 * 60 * 1000 });
registerRecurringJob({ type: 'outbox.dispatch', everyMs: 60 * 1000, priority: 5 });
registerRecurringJob({ type: 'identity.encrypt-legacy', everyMs: 15 * 60 * 1000, priority: 1 });

export const BUILT_IN_JOB_TYPES = ['scheduler.rules', 'outbox.dispatch', 'identity.encrypt-legacy'] as const;
