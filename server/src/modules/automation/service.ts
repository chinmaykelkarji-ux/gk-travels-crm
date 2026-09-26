// ============================================================
// Automation engine — `automation.sweep` on the job runner, every 15 minutes
// per organisation (replaces the classic `scheduler.rules`).
//
//   for each rule that is switched on
//     → the events its trigger sees (events.ts), only since it was switched on
//     → each event not acted on before: claim a run row (rule + event key is
//       unique, so two ticks cannot both act), do the actions, record what
//       each did — sent, not sent and why, notified whom
//     → a failed run tells the owner, once per rule per day
//
// Sending goes through the same service a person uses (modules/comms), so a
// message with a gap, or through an unconfigured channel, is refused and the
// run says why. Nothing is sent by a rule the owner has not switched on.
// ============================================================

import type { AutomationRule, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, isAppError, notFound } from '../../core/errors.js';
import { istToday } from '../../../../src/shared/calc/istTime.js';
import {
  AUTOMATION_BY_KEY, AUTOMATION_RULES, describeAction, effectiveParams, runStatus, validateParams,
  type AutomationAction, type RuleDef, type RunOutcome, type TriggerCode,
} from '../../../../src/shared/calc/automation.js';
import { sendMessage } from '../comms/service.js';
import { notify } from '../notifications/service.js';
import { eventsFor, type AutomationEvent } from './events.js';

/** Writes any catalogue rule this organisation does not have yet. Customer-facing ones start off. */
export async function ensureRules(): Promise<void> {
  const now = new Date();
  await prisma.automationRule.createMany({
    skipDuplicates: true,
    data: AUTOMATION_RULES.map(r => ({
      key: r.key, trigger: r.trigger, name: r.name, params: r.defaultParams as Prisma.InputJsonValue,
      actions: r.defaultActions as unknown as Prisma.InputJsonValue, enabled: !r.customerFacing, enabledAt: r.customerFacing ? null : now,
    })),
  });
}

function defOf(rule: AutomationRule): RuleDef {
  const def = AUTOMATION_BY_KEY.get(rule.key);
  if (!def) throw notFound('Automation rule');
  return def;
}

async function act(action: AutomationAction, e: AutomationEvent, runId: string, ruleName: string): Promise<RunOutcome> {
  if (action.type === 'notify') {
    const n = await notify({ roles: action.roles, type: 'automation', title: e.title, body: ruleName, link: e.link, entityType: e.entityType, entityId: e.entityId, dedupeKey: `automation:${runId}` });
    return { ok: true, detail: `Notified ${n} ${n === 1 ? 'person' : 'people'}` };
  }
  if (!e.tripId && !e.customerId) return { ok: false, skipped: true, detail: 'No customer to message' };
  try {
    const m = await sendMessage({
      templateKey: action.templateKey, channel: action.channel, tripId: e.tripId ?? null, customerId: e.customerId ?? null,
      receiptId: e.receiptId ?? null, ticketId: e.ticketId ?? null, travellerId: null, to: null,
    }, null, 'AUTOMATION', runId, e.extra);
    return { ok: true, detail: `Queued ${action.channel === 'WHATSAPP' ? 'WhatsApp' : 'email'} to ${m.to}` };
  } catch (err) {
    return { ok: false, detail: isAppError(err) ? err.message : 'The message could not be queued' };
  }
}

/** One rule, one event: claim it, act, record. Returns null when it was already acted on. */
async function runOne(rule: AutomationRule, e: AutomationEvent) {
  // Checked first to keep the log quiet; the unique (rule, event) index is what really guards a race.
  if (await prisma.automationRun.findFirst({ where: { ruleId: rule.id, eventKey: e.key }, select: { id: true } })) return null;
  let run;
  try {
    run = await prisma.automationRun.create({ data: { ruleId: rule.id, eventKey: e.key, entityType: e.entityType, entityId: e.entityId, status: 'RUNNING', summary: e.title, outcomes: [] } });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return null;
    throw err;
  }
  const outcomes: RunOutcome[] = [];
  for (const a of rule.actions as unknown as AutomationAction[]) outcomes.push(await act(a, e, run.id, rule.name));
  const status = runStatus(outcomes);
  await prisma.automationRun.update({ where: { id: run.id }, data: { status, outcomes: outcomes as unknown as Prisma.InputJsonValue } });
  if (status === 'FAILED') {
    await notify({
      roles: ['ADMIN'], type: 'automation_failed', title: `Automation "${rule.name}" could not finish`,
      body: outcomes.filter(o => !o.ok && !o.skipped).map(o => o.detail).join('; '), link: '/settings/automations',
      entityType: 'automation_rule', entityId: rule.id, dedupeKey: `automation_failed:${rule.id}:${istToday()}`,
    });
  }
  return status;
}

export interface SweepSummary { rules: number; events: number; done: number; skipped: number; failed: number }

export async function sweep(now = new Date(), onlyKey?: string): Promise<SweepSummary> {
  await ensureRules();
  const rules = await prisma.automationRule.findMany({ where: { enabled: true, ...(onlyKey ? { key: onlyKey } : {}) } });
  const s: SweepSummary = { rules: rules.length, events: 0, done: 0, skipped: 0, failed: 0 };
  for (const rule of rules) {
    const def = AUTOMATION_BY_KEY.get(rule.key);
    if (!def) continue;
    const events = await eventsFor(rule.trigger as TriggerCode, effectiveParams(def, rule.params as Record<string, unknown>), rule.enabledAt ?? now, now);
    for (const e of events) {
      const status = await runOne(rule, e);
      if (!status) continue;
      s.events++;
      if (status === 'DONE') s.done++; else if (status === 'SKIPPED') s.skipped++; else s.failed++;
    }
  }
  return s;
}

// ── The settings screen ───────────────────────────────────────

export async function listRules() {
  await ensureRules();
  const [rows, counts] = await Promise.all([
    prisma.automationRule.findMany(),
    prisma.automationRun.groupBy({ by: ['ruleId', 'status'], where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _count: { _all: true } }),
  ]);
  return AUTOMATION_RULES.map(def => {
    const r = rows.find(x => x.key === def.key)!;
    const last30 = Object.fromEntries(counts.filter(c => c.ruleId === r.id).map(c => [c.status, c._count._all]));
    return {
      id: r.id, key: def.key, name: def.name, description: def.description, customerFacing: def.customerFacing, replaces: def.replaces ?? null,
      enabled: r.enabled, enabledAt: r.enabledAt?.toISOString() ?? null, params: effectiveParams(def, r.params as Record<string, unknown>), paramDefs: def.params,
      actions: (r.actions as unknown as AutomationAction[]).map(a => ({ ...a, label: describeAction(a) })), last30,
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

export async function updateRule(key: string, input: { enabled?: boolean; params?: Record<string, unknown>; channel?: 'WHATSAPP' | 'EMAIL' }, actorId?: string | null) {
  await ensureRules();
  const rule = await prisma.automationRule.findFirst({ where: { key } });
  if (!rule) throw notFound('Automation rule');
  const def = defOf(rule);
  const errors = input.params ? validateParams(def, input.params) : {};
  if (Object.keys(errors).length) throw new AppError('VALIDATION_ERROR', 400, 'Check the rule settings', errors);
  const actions = (rule.actions as unknown as AutomationAction[]).map(a => (a.type === 'send' && input.channel ? { ...a, channel: input.channel } : a));
  const switchingOn = input.enabled === true && !rule.enabled;
  const data: Prisma.AutomationRuleUpdateInput = {
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(switchingOn ? { enabledAt: new Date() } : {}),
    ...(input.params ? { params: { ...(rule.params as object), ...input.params } as Prisma.InputJsonValue } : {}),
    actions: actions as unknown as Prisma.InputJsonValue, updatedById: actorId ?? null,
  };
  await prisma.$transaction(async tx => {
    const after = await tx.automationRule.update({ where: { id: rule.id }, data });
    await audit(tx, {
      action: 'automation_rule_updated', entityType: 'automation_rule', entityId: rule.id, userId: actorId,
      description: `Automation "${rule.name}" ${input.enabled === undefined ? 'changed' : input.enabled ? 'switched on' : 'switched off'}`,
      before: { enabled: rule.enabled, params: rule.params, actions: rule.actions }, after: { enabled: after.enabled, params: after.params, actions: after.actions },
    });
  });
  return (await listRules()).find(r => r.key === key)!;
}

export async function runsFor(key: string) {
  const rule = await prisma.automationRule.findFirst({ where: { key } });
  if (!rule) throw notFound('Automation rule');
  const runs = await prisma.automationRun.findMany({ where: { ruleId: rule.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  return runs.map(r => ({ id: r.id, status: r.status, summary: r.summary, outcomes: r.outcomes as unknown as RunOutcome[], entityType: r.entityType, entityId: r.entityId, at: r.createdAt.toISOString() }));
}
