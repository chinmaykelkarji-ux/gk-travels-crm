// ============================================================
// Tasks v2: the Today view (open tasks sorted by urgency), manual tasks,
// assignment, snooze, completion, and the rule settings the engine reads.
// Rule tasks keep their title and due time from the rule; people may
// assign, snooze, re-prioritise, complete or cancel them.
// ============================================================

import { randomUUID } from 'node:crypto';
import type { Prisma, Role, Task } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { istDay, istToday } from '../../../../src/shared/calc/istTime.js';
import {
  BUCKET_LABEL, effectiveRules, MONEY_RULES, RULE_BY_CODE, RULES, sortByUrgency, validateRuleParams,
  type RuleCode, type RuleSettings, type UrgencyBucket,
} from '../../../../src/shared/calc/taskRules.js';
import type { TaskCreate, TaskListQuery, TaskRuleUpdate, TaskUpdate, TodayQuery } from '../../../../src/shared/contracts/tasks.js';
import { hasPermission } from '../../lib/permissions.js';
import { OPEN_TASK, sweep } from './engine.js';

const INCLUDE = { trip: { select: { id: true, tourName: true, destination: true, stage: true } } } satisfies Prisma.TaskInclude;
type Row = Prisma.TaskGetPayload<{ include: typeof INCLUDE }>;

function taskDto(t: Row) {
  return {
    id: t.id, title: t.title, description: t.description, priority: t.priority, status: t.status, source: t.source,
    ruleCode: t.ruleCode, ruleName: t.ruleCode ? RULE_BY_CODE.get(t.ruleCode as RuleCode)?.name ?? t.ruleCode : null,
    tripId: t.tripId, trip: t.trip ? { id: t.trip.id, label: t.trip.tourName ?? t.trip.destination, stage: t.trip.stage } : null,
    customerId: t.customerId, entityType: t.entityType, entityId: t.entityId,
    dueAt: t.dueAt?.toISOString() ?? null, dueDate: t.dueDate, snoozedUntil: t.snoozedUntil?.toISOString() ?? null,
    assignedToUserId: t.assignedToUserId, assignedTo: t.assignedTo, completedAt: t.completedAt?.toISOString() ?? null, closeReason: t.closeReason, autoClosed: !!t.autoClosedAt,
    createdAt: t.createdAt.toISOString(),
  };
}
export type TaskDto = ReturnType<typeof taskDto>;

/**
 * Money tasks name what a customer owes and what a supplier costs, and they
 * point at screens only the accounts can open, so they need the same
 * `finance:read` every money screen needs. Other roles simply never see them.
 */
function moneyFence(role?: string): Prisma.TaskWhereInput {
  if (!role || hasPermission(role as Role, 'finance:read')) return {};
  // `notIn` alone would also drop every task with no rule at all, so the
  // manual ones are named explicitly; `AND` keeps the caller's own `OR` free.
  return { AND: [{ OR: [{ ruleCode: null }, { ruleCode: { notIn: MONEY_RULES } }] }] };
}

export async function listTasks(q: TaskListQuery, userId: string | undefined, role?: string) {
  const where: Prisma.TaskWhereInput = {
    ...moneyFence(role),
    ...(q.status === 'open' ? { status: { in: OPEN_TASK } } : q.status === 'done' ? { status: { in: ['completed', 'cancelled'] } } : {}),
    ...(q.mine ? { assignedToUserId: userId ?? '__none__' } : {}),
    ...(q.tripId ? { tripId: q.tripId } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.task.findMany({ where, include: INCLUDE, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.task.count({ where }),
  ]);
  return { items: rows.map(taskDto), total, page: q.page, pageSize: q.pageSize };
}

/** Open tasks due within a week (and everything overdue or undated), most urgent first, in buckets. */
export async function today(q: TodayQuery, userId: string | undefined, now = new Date(), role?: string) {
  const rows = await prisma.task.findMany({
    where: { status: { in: OPEN_TASK }, ...moneyFence(role), ...(q.mine ? { assignedToUserId: userId ?? '__none__' } : {}) },
    include: INCLUDE, take: 1000,
  });
  const sorted = sortByUrgency(rows.map(r => ({ ...taskDto(r) })), now).filter(t => t.bucket !== 'LATER');
  const order: UrgencyBucket[] = ['OVERDUE', 'NOW', 'TODAY', 'TOMORROW', 'THIS_WEEK', 'NO_DATE'];
  return {
    now: now.toISOString(), today: istToday(now),
    buckets: order.map(b => ({ bucket: b, label: BUCKET_LABEL[b], tasks: sorted.filter(t => t.bucket === b) })).filter(b => b.tasks.length),
    counts: Object.fromEntries(order.map(b => [b, sorted.filter(t => t.bucket === b).length])) as Record<UrgencyBucket, number>,
  };
}

async function assignee(userId: string | null | undefined) {
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, isActive: true } });
  if (!u || u.isActive === false) throw new AppError('VALIDATION_ERROR', 400, 'Choose an active user', { assignedToUserId: 'Unknown user' });
  return u;
}

export async function createTask(input: TaskCreate, actorId?: string | null) {
  if (input.tripId && !(await prisma.trip.findUnique({ where: { id: input.tripId }, select: { id: true } }))) throw new AppError('VALIDATION_ERROR', 400, 'Trip not found', { tripId: 'Unknown trip' });
  const who = await assignee(input.assignedToUserId);
  const row = await prisma.$transaction(async tx => {
    const t = await tx.task.create({
      data: {
        id: `SYS-TSK-${randomUUID().slice(0, 12)}`, source: 'MANUAL', title: input.title, description: input.description, priority: input.priority, status: 'pending',
        tripId: input.tripId ?? null, dueAt: input.dueAt ? new Date(input.dueAt) : null, dueDate: input.dueAt ? istDay(input.dueAt) : null, createdDate: istToday(),
        assignedToUserId: who?.id ?? null, assignedTo: who?.name ?? null, assignedByUserId: who ? actorId ?? null : null,
      },
      include: INCLUDE,
    });
    await audit(tx, { action: 'task_created', entityType: 'task', entityId: t.id, userId: actorId, description: `Task created: ${t.title}${who ? ` for ${who.name}` : ''}`, after: { title: t.title, dueAt: input.dueAt ?? null, assignedTo: who?.name ?? null } });
    return t;
  });
  return taskDto(row);
}

const snap = (t: Task) => ({ title: t.title, priority: t.priority, status: t.status, dueAt: t.dueAt?.toISOString() ?? null, snoozedUntil: t.snoozedUntil?.toISOString() ?? null, assignedTo: t.assignedTo });

export async function updateTask(id: string, patch: TaskUpdate, actorId?: string | null) {
  const before = await prisma.task.findUnique({ where: { id } });
  if (!before) throw notFound('Task');
  const rule = before.source === 'RULE';
  if (rule && (patch.title !== undefined || patch.dueAt !== undefined || patch.description !== undefined)) {
    throw stateConflict('This task comes from a rule: its title and due time follow the records. Snooze, assign or complete it instead.');
  }
  const data: Prisma.TaskUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.dueAt !== undefined) { data.dueAt = patch.dueAt ? new Date(patch.dueAt) : null; data.dueDate = patch.dueAt ? istDay(patch.dueAt) : null; }
  if (patch.snoozedUntil !== undefined) data.snoozedUntil = patch.snoozedUntil ? new Date(patch.snoozedUntil) : null;
  if (patch.assignedToUserId !== undefined) {
    const who = await assignee(patch.assignedToUserId);
    Object.assign(data, { assignee: who ? { connect: { id: who.id } } : { disconnect: true }, assignedTo: who?.name ?? null, assignedByUserId: actorId ?? null });
  }
  if (patch.status !== undefined && patch.status !== before.status) {
    const closing = patch.status === 'completed' || patch.status === 'cancelled';
    Object.assign(data, closing
      ? { status: patch.status, completedAt: new Date(), completedDate: istToday(), completedById: actorId ?? null, autoClosedAt: null, closeReason: patch.note ?? null }
      : { status: patch.status, completedAt: null, completedDate: null, completedById: null, autoClosedAt: null, closeReason: null });
  }
  const row = await prisma.$transaction(async tx => {
    const t = await tx.task.update({ where: { id }, data, include: INCLUDE });
    const action = patch.status === 'completed' ? 'task_completed' : patch.status === 'cancelled' ? 'task_cancelled' : patch.status && !OPEN_TASK.includes(before.status) ? 'task_reopened' : 'task_updated';
    await audit(tx, { action, entityType: 'task', entityId: id, userId: actorId, description: `${action.replace('task_', 'Task ')}: ${t.title}${patch.note ? ` — ${patch.note}` : ''}`, before: snap(before), after: snap(t) });
    return t;
  });
  return taskDto(row);
}

// ── Rule settings ─────────────────────────────────────────────

export async function listRules() {
  const rows = await prisma.taskRule.findMany();
  const stored: RuleSettings = {};
  for (const r of rows) stored[r.code as RuleCode] = { enabled: r.enabled, params: (r.params ?? {}) as Record<string, number> };
  const eff = effectiveRules(stored);
  const open = await prisma.task.groupBy({ by: ['ruleCode'], where: { source: 'RULE', status: { in: OPEN_TASK } }, _count: { _all: true } });
  const openBy = new Map(open.map(o => [o.ruleCode, o._count._all]));
  return RULES.map(r => ({ ...r, enabled: eff[r.code].enabled, values: eff[r.code].params, openTasks: openBy.get(r.code) ?? 0, updatedAt: rows.find(x => x.code === r.code)?.updatedAt.toISOString() ?? null }));
}

export async function updateRule(code: string, input: TaskRuleUpdate, actorId?: string | null) {
  const def = RULE_BY_CODE.get(code as RuleCode);
  if (!def) throw notFound('Rule');
  const errors = input.params ? validateRuleParams(def.code, input.params) : {};
  if (Object.keys(errors).length) throw new AppError('VALIDATION_ERROR', 400, 'Check the rule settings', errors);
  const before = await prisma.taskRule.findFirst({ where: { code: def.code } });
  const beforeEff = effectiveRules(before ? { [def.code]: { enabled: before.enabled, params: before.params as Record<string, number> } } : {})[def.code];
  const next = { enabled: input.enabled ?? beforeEff.enabled, params: { ...beforeEff.params, ...(input.params ?? {}) } };
  await prisma.$transaction(async tx => {
    if (before) await tx.taskRule.update({ where: { id: before.id }, data: { enabled: next.enabled, params: next.params, updatedById: actorId ?? null } });
    else await tx.taskRule.create({ data: { code: def.code, enabled: next.enabled, params: next.params, updatedById: actorId ?? null } });
    await audit(tx, { action: 'task_rule_updated', entityType: 'settings', entityId: `task-rule:${def.code}`, userId: actorId, description: `Task rule "${def.name}" ${next.enabled ? 'on' : 'off'}${def.params.length ? `: ${def.params.map(p => `${p.label.toLowerCase()} ${next.params[p.key]} ${p.unit}`).join(', ')}` : ''}`, before: beforeEff, after: next });
  });
  // New timings apply at once: recalculate every trip and the sales pipeline.
  const recalculated = await sweep();
  return { rules: await listRules(), recalculated };
}
