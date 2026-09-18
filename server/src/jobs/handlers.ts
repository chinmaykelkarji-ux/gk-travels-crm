// ============================================================
// Built-in job handlers. Importing this module registers them.
//
//   scheduler.rules  — every 15 min per organisation: payment reminders
//                      (7/3/1 days), supplier confirmation alerts, departure
//                      reminders → outbox events (idempotent per rule/day)
//   outbox.dispatch  — every minute per organisation: deliver pending outbox
//                      events (WhatsApp/email adapters; logged to message_logs)
// ============================================================

import { registerJobHandler, registerRecurringJob } from '../core/jobs.js';
import { runSchedulerRules } from '../workers/schedulerWorker.js';
import { processOutboxBatch } from '../workers/outboxWorker.js';

registerJobHandler('scheduler.rules', async () => runSchedulerRules());
registerJobHandler('outbox.dispatch', async () => processOutboxBatch());

registerRecurringJob({ type: 'scheduler.rules', everyMs: 15 * 60 * 1000 });
registerRecurringJob({ type: 'outbox.dispatch', everyMs: 60 * 1000, priority: 5 });

export const BUILT_IN_JOB_TYPES = ['scheduler.rules', 'outbox.dispatch'] as const;
