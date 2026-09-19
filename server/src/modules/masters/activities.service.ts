// Activities master: sightseeing, darshan, boat rides, shows — each with a
// provider (vendor) and default per-adult / per-child cost and sell. Cost and
// sell are hidden from roles without commercial access.

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound } from '../../core/errors.js';
import { canSeeCommercials } from '../../lib/redact.js';
import type { ActivityInput, ActivityUpdate, MasterListQuery } from '../../../../src/shared/contracts/masters.js';
import { assertVendor, changedKeys, n, page, pick } from './common.js';

const INCLUDE = { vendor: { select: { id: true, name: true } } } as const;
type Row = Prisma.ActivityGetPayload<{ include: typeof INCLUDE }>;

function dto(a: Row, role: string | undefined) {
  const c = canSeeCommercials(role);
  return {
    id: a.id, name: a.name, city: a.city, category: a.category, vendorId: a.vendorId, vendor: a.vendor, durationMinutes: a.durationMinutes,
    description: a.description, inclusions: a.inclusions, minPax: a.minPax, maxPax: a.maxPax, notes: a.notes, isActive: a.isActive,
    costAdult: c ? n(a.costAdult) : null, costChild: c ? n(a.costChild) : null, sellAdult: c ? n(a.sellAdult) : null, sellChild: c ? n(a.sellChild) : null,
    canSeePrices: c, createdAt: a.createdAt.toISOString(),
  };
}
export type ActivityDto = ReturnType<typeof dto>;

export async function listActivities(q: MasterListQuery, role: string | undefined) {
  const term = q.q?.trim();
  const where: Prisma.ActivityWhereInput = {
    ...(q.includeInactive ? {} : { isActive: true }),
    ...(q.city ? { city: { contains: q.city, mode: 'insensitive' } } : {}),
    ...(q.vendorId ? { vendorId: q.vendorId } : {}),
    ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { city: { contains: term, mode: 'insensitive' } }, { category: { contains: term, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.activity.findMany({ where, orderBy: [{ city: 'asc' }, { name: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: INCLUDE }),
    prisma.activity.count({ where }),
  ]);
  return page(rows.map(r => dto(r, role)), total, q);
}

export async function getActivity(id: string, role: string | undefined) {
  const a = await prisma.activity.findUnique({ where: { id }, include: INCLUDE });
  if (!a) throw notFound('Activity');
  return dto(a, role);
}

async function assertNoDuplicate(name: string, city: string, excludeId?: string) {
  const dup = await prisma.activity.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, city: { equals: city, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
  if (dup) throw new AppError('CONFLICT', 409, `${name} in ${city} already exists`, { existingActivityId: dup.id });
}

/** Strips prices a non-commercial role may not set. */
function writable(input: Partial<ActivityInput>, role: string | undefined): Partial<ActivityInput> {
  if (canSeeCommercials(role)) return input;
  const { costAdult: _a, costChild: _b, sellAdult: _c, sellChild: _d, ...rest } = input;
  return rest;
}

export async function createActivity(input: ActivityInput, role: string | undefined, actorId?: string | null) {
  await assertVendor(prisma, input.vendorId);
  await assertNoDuplicate(input.name, input.city);
  const a = await prisma.$transaction(async tx => {
    const created = await tx.activity.create({ data: writable(input, role) as Prisma.ActivityUncheckedCreateInput, include: INCLUDE });
    await audit(tx, { action: 'activity_master_created', entityType: 'activity', entityId: created.id, userId: actorId, description: `Activity ${created.name}, ${created.city} added`, after: { name: created.name, city: created.city, vendorId: created.vendorId } });
    return created;
  });
  return dto(a, role);
}

const AUDITED = ['name', 'city', 'category', 'vendorId', 'durationMinutes', 'description', 'inclusions', 'costAdult', 'costChild', 'sellAdult', 'sellChild', 'minPax', 'maxPax', 'notes', 'isActive'];

export async function updateActivity(id: string, input: ActivityUpdate, role: string | undefined, actorId?: string | null) {
  const before = await prisma.activity.findUnique({ where: { id } });
  if (!before) throw notFound('Activity');
  if (input.vendorId) await assertVendor(prisma, input.vendorId);
  if (input.name !== undefined || input.city !== undefined) await assertNoDuplicate(input.name ?? before.name, input.city ?? before.city, id);
  const minPax = input.minPax !== undefined ? input.minPax : before.minPax;
  const maxPax = input.maxPax !== undefined ? input.maxPax : before.maxPax;
  if (minPax !== null && maxPax !== null && maxPax < minPax) throw new AppError('VALIDATION_ERROR', 400, 'Max pax must be at least min pax', { maxPax: 'At least min pax' });
  const a = await prisma.$transaction(async tx => {
    const after = await tx.activity.update({ where: { id }, data: writable(input, role), include: INCLUDE });
    const keys = changedKeys(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, AUDITED);
    await audit(tx, { action: 'activity_master_updated', entityType: 'activity', entityId: id, userId: actorId, description: `Activity ${after.name} updated (${keys.join(', ') || 'no changes'})`, before: pick(before as unknown as Record<string, unknown>, keys), after: pick(after as unknown as Record<string, unknown>, keys) });
    return after;
  });
  return dto(a, role);
}
