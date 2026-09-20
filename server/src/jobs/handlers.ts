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
//   legacy.bookings-import — hourly per organisation: carry bookings made on
//                      the classic screen into tickets / hotels / vehicles /
//                      activities (idempotent SQL function)
//   legacy.payments-import — hourly per organisation: carry customer
//                      payments recorded on the classic screens into receipts
//                      with their ledger postings (idempotent per payment)
//   tasks.sweep      — every 15 min per organisation: the task engine
//                      re-evaluates every open trip and the sales pipeline
//                      (time-based rules; records without trip hooks)
// ============================================================

import { registerJobHandler, registerRecurringJob } from '../core/jobs.js';
import { runSchedulerRules } from '../workers/schedulerWorker.js';
import { processOutboxBatch } from '../workers/outboxWorker.js';
import { encryptLegacyIdentityBatch } from '../core/identity.js';
import { importLegacyBookings } from '../modules/tickets/legacyImport.js';
import { sweep as sweepTasks } from '../modules/tasks/engine.js';
import { importLegacyPayments } from '../modules/receipts/legacyImport.js';

registerJobHandler('scheduler.rules', async () => runSchedulerRules());
registerJobHandler('outbox.dispatch', async () => processOutboxBatch());
registerJobHandler('identity.encrypt-legacy', async () => encryptLegacyIdentityBatch());
registerJobHandler('legacy.bookings-import', async () => importLegacyBookings(null));
registerJobHandler('tasks.sweep', async () => sweepTasks());
registerJobHandler('legacy.payments-import', async () => importLegacyPayments());

registerRecurringJob({ type: 'scheduler.rules', everyMs: 15 * 60 * 1000 });
registerRecurringJob({ type: 'outbox.dispatch', everyMs: 60 * 1000, priority: 5 });
registerRecurringJob({ type: 'identity.encrypt-legacy', everyMs: 15 * 60 * 1000, priority: 1 });
registerRecurringJob({ type: 'legacy.bookings-import', everyMs: 60 * 60 * 1000, priority: 0 });
registerRecurringJob({ type: 'tasks.sweep', everyMs: 15 * 60 * 1000, priority: 3 });
registerRecurringJob({ type: 'legacy.payments-import', everyMs: 60 * 60 * 1000, priority: 0 });

export const BUILT_IN_JOB_TYPES = ['scheduler.rules', 'outbox.dispatch', 'identity.encrypt-legacy', 'legacy.bookings-import', 'tasks.sweep', 'legacy.payments-import'] as const;
