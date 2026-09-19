// ============================================================
// Task engine. Rules (calc/taskRules.ts) say which tasks a trip or the
// sales pipeline needs right now; this module makes the tasks table match:
//   - a new key becomes a pending task (id SYS-TSK-…, source RULE)
//   - an open task's title, due time and owner follow the data
//   - an open task whose key is no longer wanted is closed automatically
//     (autoClosedAt + reason) and reopened if the need comes back
//   - a task a person completed or cancelled is never re-created
// Runs inside every trip write (trip-change hook) and every 15 minutes
// (job tasks.sweep) for time-based rules and records without hooks.
// ============================================================

import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { auditMany, type AuditInput } from '../../core/audit.js';
import { istDay, istToday, addDays, toIstLocal } from '../../../../src/shared/calc/istTime.js';
import { travellerDisplayName } from '../../../../src/shared/calc/travellers.js';
import {
  effectiveRules, evaluateSalesRules, evaluateTripRules, RULE_BY_CODE, SALES_RULES, TRIP_RULES,
  type DesiredTask, type RuleCode, type RuleSettings, type TripFacts,
} from '../../../../src/shared/calc/taskRules.js';
import { registerTripChangeHook } from '../operations/hooks.js';

export const OPEN_TASK = ['pending', 'in_progress'];

export async function loadRuleSettings(db: DbClient) {
  const rows = await db.taskRule.findMany({ select: { code: true, enabled: true, params: true } });
  const stored: RuleSettings = {};
  for (const r of rows) stored[r.code as RuleCode] = { enabled: r.enabled, params: (r.params ?? {}) as Record<string, number> };
  return effectiveRules(stored);
}

export async function loadTripFacts(db: DbClient, tripId: string): Promise<TripFacts | null> {
  const t = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true, tourName: true, destination: true, customer: true, customerId: true, stage: true, departure: true, returnDate: true, isInternational: true, balanceDue: true, pax: true, assignedOpsUserId: true,
      tickets: { select: { id: true, displayNumber: true, pnr: true, mode: true, status: true, quota: true, travelClass: true, chartPrepared: true, segments: { select: { id: true, fromName: true, toName: true, fromCode: true, toCode: true, departAt: true, travelClass: true, _count: { select: { passengers: true } } } } } },
      hotelBookings: { select: { id: true, hotelName: true, checkIn: true, status: true } },
      vehicleAssignments: { select: { id: true, startAt: true, status: true, driverId: true, driverName: true, vehicleType: true, vehicleRegNo: true, vehicle: { select: { registrationNo: true, type: true } } } },
      activityBookings: { select: { id: true, name: true, date: true, time: true, status: true } },
      travellers: { select: { traveller: { select: { id: true, title: true, firstName: true, lastName: true, displayName: true, passportExpiry: true, passportLast4: true, passportNumber: true, passportNumberEnc: true } } } },
    },
  });
  if (!t) return null;
  return {
    id: t.id, label: t.tourName ?? t.destination, customer: t.customer, customerId: t.customerId, stage: t.stage, departure: t.departure, returnDate: t.returnDate,
    isInternational: t.isInternational, balanceDue: Number(t.balanceDue ?? 0), pax: t.pax, ownerUserId: t.assignedOpsUserId,
    segments: t.tickets.flatMap(k => k.segments.map(s => ({
      id: s.id, ticketId: k.id, ticketLabel: k.pnr ? `PNR ${k.pnr}` : (k.displayNumber ?? k.id), mode: k.mode, ticketStatus: k.status, quota: k.quota, travelClass: s.travelClass ?? k.travelClass,
      route: `${s.fromCode ?? s.fromName} → ${s.toCode ?? s.toName}`, departAt: s.departAt?.toISOString() ?? null, paxCount: s._count.passengers, chartPrepared: k.chartPrepared,
    }))),
    hotels: t.hotelBookings.map(h => ({ id: h.id, hotelName: h.hotelName, checkIn: h.checkIn.toISOString().slice(0, 10), status: h.status })),
    vehicles: t.vehicleAssignments.map(v => ({ id: v.id, label: `${v.vehicle?.registrationNo ?? v.vehicleRegNo ?? v.vehicleType ?? v.vehicle?.type ?? 'Vehicle'} ${toIstLocal(v.startAt)!.replace('T', ' ')}`, startAt: v.startAt.toISOString(), status: v.status, hasDriver: !!(v.driverId || v.driverName) })),
    activities: t.activityBookings.map(a => ({ id: a.id, name: a.name, date: a.date.toISOString().slice(0, 10), time: a.time, status: a.status })),
    travellers: t.travellers.map(x => ({ id: x.traveller.id, name: travellerDisplayName(x.traveller), passportExpiry: x.traveller.passportExpiry, hasPassport: !!(x.traveller.passportLast4 || x.traveller.passportNumberEnc || x.traveller.passportNumber) })),
  };
}

export interface ApplyResult { created: number; updated: number; closed: number; reopened: number }

async function userNames(db: DbClient, ids: (string | null | undefined)[]) {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map<string, string>();
  const users = await db.user.findMany({ where: { id: { in: want } }, select: { id: true, name: true } });
  return new Map(users.map(u => [u.id, u.name]));
}

/** Makes the rule tasks in `scope` match `desired`. */
export async function applyDesired(db: DbClient, desired: DesiredTask[], scope: { codes: RuleCode[]; tripId?: string; tripIds?: string[] }, now: Date): Promise<ApplyResult> {
  const res: ApplyResult = { created: 0, updated: 0, closed: 0, reopened: 0 };
  const keys = desired.map(d => d.key);
  const tripFilter: Prisma.TaskWhereInput = scope.tripId ? { tripId: scope.tripId } : scope.tripIds ? { tripId: { in: scope.tripIds } } : {};
  const existing = await db.task.findMany({
    where: { OR: [...(keys.length ? [{ ruleKey: { in: keys } }] : []), { status: { in: OPEN_TASK }, source: 'RULE', ruleCode: { in: scope.codes }, ...tripFilter }] },
  });
  const byKey = new Map(existing.filter(e => e.ruleKey).map(e => [e.ruleKey!, e]));
  const names = await userNames(db, desired.map(d => d.assignedToUserId));
  const audits: AuditInput[] = [];
  const today = istToday(now);
  const toCreate: Prisma.TaskCreateManyInput[] = [];

  for (const d of desired) {
    const e = byKey.get(d.key);
    if (!e) {
      toCreate.push({
        id: `SYS-TSK-${randomUUID().slice(0, 12)}`, source: 'RULE', ruleCode: d.ruleCode, ruleKey: d.key, title: d.title, description: d.description,
        priority: d.priority, status: 'pending', tripId: d.tripId, customerId: d.customerId, entityType: d.entityType, entityId: d.entityId,
        dueAt: new Date(d.dueAt), dueDate: istDay(d.dueAt), createdDate: today,
        assignedToUserId: d.assignedToUserId ?? null, assignedTo: d.assignedToUserId ? names.get(d.assignedToUserId) ?? null : null,
      });
      continue;
    }
    const isOpen = OPEN_TASK.includes(e.status);
    if (!isOpen && !e.autoClosedAt) continue; // a person closed it: never re-create
    const data: Prisma.TaskUpdateInput = {};
    if (!isOpen) {
      Object.assign(data, { status: 'pending', autoClosedAt: null, closeReason: null, completedAt: null, completedDate: null });
      res.reopened++;
      audits.push({ action: 'task_reopened', entityType: 'task', entityId: e.id, source: 'SYSTEM', description: `Task reopened: ${d.title}`, before: { status: e.status }, after: { status: 'pending' } });
    }
    if (e.title !== d.title) data.title = d.title;
    if (e.description !== d.description) data.description = d.description;
    if (!d.keepDue && e.dueAt?.toISOString() !== d.dueAt) { data.dueAt = new Date(d.dueAt); data.dueDate = istDay(d.dueAt); }
    // The owner follows the record only while nobody has reassigned the task by hand.
    if (d.assignedToUserId !== undefined && !e.assignedByUserId && e.assignedToUserId !== (d.assignedToUserId ?? null)) {
      data.assignee = d.assignedToUserId ? { connect: { id: d.assignedToUserId } } : { disconnect: true };
      data.assignedTo = d.assignedToUserId ? names.get(d.assignedToUserId) ?? null : null;
    }
    if (Object.keys(data).length) {
      await db.task.update({ where: { id: e.id }, data });
      if (isOpen) res.updated++;
    }
  }
  if (toCreate.length) {
    const r = await db.task.createMany({ data: toCreate, skipDuplicates: true });
    res.created = r.count;
    for (const c of toCreate) audits.push({ action: 'task_created', entityType: 'task', entityId: c.id, source: 'SYSTEM', description: `Task created by rule ${RULE_BY_CODE.get(c.ruleCode as RuleCode)?.name ?? c.ruleCode}: ${c.title}`, after: { ruleKey: c.ruleKey, dueAt: c.dueAt } });
  }

  const wanted = new Set(keys);
  const stale = existing.filter(e => OPEN_TASK.includes(e.status) && e.source === 'RULE' && e.ruleKey && !wanted.has(e.ruleKey) && scope.codes.includes(e.ruleCode as RuleCode));
  for (const e of stale) {
    const reason = e.ruleCode === 'TRAIN_WL_CHECK' ? 'Replaced by the next day\'s check or no longer waitlisted' : `No longer needed (${RULE_BY_CODE.get(e.ruleCode as RuleCode)?.name ?? e.ruleCode})`;
    await db.task.update({ where: { id: e.id }, data: { status: 'completed', autoClosedAt: now, closeReason: reason, completedAt: now, completedDate: today } });
    audits.push({ action: 'task_auto_closed', entityType: 'task', entityId: e.id, source: 'SYSTEM', description: `Task closed automatically: ${e.title} — ${reason}`, before: { status: e.status }, after: { status: 'completed', closeReason: reason } });
  }
  res.closed = stale.length;
  await auditMany(db, audits);
  return res;
}

export async function recalcTrip(db: DbClient, tripId: string, now = new Date()): Promise<ApplyResult> {
  const facts = await loadTripFacts(db, tripId);
  const rules = await loadRuleSettings(db);
  const desired = facts ? evaluateTripRules(facts, rules, now) : [];
  return applyDesired(db, desired, { codes: TRIP_RULES, tripId }, now);
}

export async function recalcSales(db: DbClient, now = new Date()): Promise<ApplyResult> {
  const rules = await loadRuleSettings(db);
  const [leads, quotes] = await Promise.all([
    db.lead.findMany({ where: { status: { in: ['new', 'contacted', 'qualified'] }, followUpDate: { not: null }, deletedAt: null }, select: { id: true, name: true, status: true, followUpDate: true, assignedToUserId: true } }),
    db.salesQuote.findMany({ where: { status: { in: ['SENT', 'VIEWED'] }, sentAt: { not: null } }, select: { id: true, quoteNumber: true, status: true, sentAt: true, customerId: true, customer: { select: { name: true } }, enquiry: { select: { assignedToUserId: true } } } }),
  ]);
  const desired = evaluateSalesRules({
    leads: leads.map(l => ({ id: l.id, name: l.name, status: l.status, followUpDate: l.followUpDate, assignedToUserId: l.assignedToUserId })),
    quotes: quotes.map(q => ({ id: q.id, number: q.quoteNumber ?? q.id, customer: q.customer.name, customerId: q.customerId, status: q.status, sentAt: q.sentAt!.toISOString(), assignedToUserId: q.enquiry?.assignedToUserId ?? null })),
  }, rules, now);
  return applyDesired(db, desired, { codes: SALES_RULES }, now);
}

/** Every trip that can need or hold rule tasks, then the sales pipeline. */
export async function sweep(now = new Date()) {
  const recent = addDays(istToday(now), -31);
  const trips = await prisma.trip.findMany({
    where: { OR: [{ stage: { in: ['PLANNING', 'CONFIRMING', 'READY', 'ONGOING'] } }, { stage: 'COMPLETED', OR: [{ returnDate: { gte: recent } }, { departure: { gte: recent } }] }, { tasks: { some: { source: 'RULE', status: { in: OPEN_TASK } } } }] },
    select: { id: true },
  });
  const total: ApplyResult & { trips: number } = { created: 0, updated: 0, closed: 0, reopened: 0, trips: trips.length };
  for (const t of trips) {
    const r = await prisma.$transaction(tx => recalcTrip(tx, t.id, now));
    total.created += r.created; total.updated += r.updated; total.closed += r.closed; total.reopened += r.reopened;
  }
  const s = await prisma.$transaction(tx => recalcSales(tx, now));
  total.created += s.created; total.updated += s.updated; total.closed += s.closed; total.reopened += s.reopened;
  return total;
}

// Trip writes recalculate that trip's tasks in the same transaction.
registerTripChangeHook('tasks', async (tx, tripId) => { await recalcTrip(tx, tripId); });
