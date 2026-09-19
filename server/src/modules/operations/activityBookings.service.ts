// ============================================================
// Activity bookings of a trip (darshan slots, boat rides, sightseeing):
// provider, date/time, participants, confirmation. Priced from the
// activity master when no amount is given (commercial roles only).
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { canSeeCommercials } from '../../lib/redact.js';
import { canTransition, needsReconfirmation, OPS_TRANSITIONS, RECONFIRM_FIELDS } from '../../../../src/shared/calc/operations.js';
import { mulPaise, sumPaise, toPaise, toRupees } from '../../../../src/shared/calc/money.js';
import type { ActivityBookingInput, ActivityBookingUpdate, OpsStatusChange } from '../../../../src/shared/contracts/operations.js';
import { assertOpenTrip, assertContractOnTrip, stripCommercials, money, isoDay, dayDate } from './common.js';
import { tripChanged } from './hooks.js';

const INCLUDE = { activity: { select: { id: true, name: true, city: true, durationMinutes: true } }, vendor: { select: { id: true, name: true, phone: true } } } satisfies Prisma.ActivityBookingInclude;
type Row = Prisma.ActivityBookingGetPayload<{ include: typeof INCLUDE }>;

export function activityBookingDto(b: Row, role: string | undefined) {
  return {
    id: b.id, tripId: b.tripId, contractId: b.contractId, activityId: b.activityId, activity: b.activity, name: b.name, city: b.city,
    date: isoDay(b.date)!, time: b.time, adults: b.adults, children: b.children, status: b.status, confirmationNo: b.confirmationNo,
    vendorId: b.vendorId, vendor: b.vendor, ...money(role, b.costAmount, b.sellAmount), customerNotes: b.customerNotes, internalNotes: b.internalNotes,
    confirmedAt: b.confirmedAt?.toISOString() ?? null, cancelReason: b.cancelReason, legacyBookingId: b.legacyBookingId, createdAt: b.createdAt.toISOString(),
  };
}
export type ActivityBookingDto = ReturnType<typeof activityBookingDto>;

export async function listActivityBookings(tripId: string, role: string | undefined) {
  const rows = await prisma.activityBooking.findMany({ where: { tripId }, orderBy: [{ date: 'asc' }, { time: 'asc' }], include: INCLUDE });
  return rows.map(r => activityBookingDto(r, role));
}

async function resolveActivity(db: DbClient, input: Partial<ActivityBookingInput>, role: string | undefined, isCreate: boolean) {
  const out: Record<string, unknown> = {};
  if (input.vendorId && !(await db.vendor.findUnique({ where: { id: input.vendorId }, select: { id: true } }))) throw new AppError('VALIDATION_ERROR', 400, 'Vendor not found', { vendorId: 'Unknown vendor' });
  if (!input.activityId) return out;
  const a = await db.activity.findUnique({ where: { id: input.activityId } });
  if (!a) throw new AppError('VALIDATION_ERROR', 400, 'Activity not found', { activityId: 'Unknown activity' });
  out.name = input.name || a.name;
  out.city = input.city ?? a.city;
  if ((isCreate ? !input.vendorId : input.vendorId === undefined) && a.vendorId) out.vendorId = a.vendorId;
  const adults = input.adults ?? 0, children = input.children ?? 0;
  if (canSeeCommercials(role) && !(input.costAmount ?? 0) && !(input.sellAmount ?? 0)) {
    const price = (adultRate: unknown, childRate: unknown) => (adultRate === null && childRate === null ? null : toRupees(sumPaise([mulPaise(toPaise(adultRate as number | null), adults), mulPaise(toPaise((childRate ?? adultRate) as number | null), children)])));
    const cost = price(a.costAdult === null ? null : Number(a.costAdult), a.costChild === null ? null : Number(a.costChild));
    const sell = price(a.sellAdult === null ? null : Number(a.sellAdult), a.sellChild === null ? null : Number(a.sellChild));
    if (cost !== null) out.costAmount = cost;
    if (sell !== null) out.sellAmount = sell;
  }
  return out;
}

export async function createActivityBooking(tripId: string, input: ActivityBookingInput, role: string | undefined, actorId?: string | null) {
  await assertOpenTrip(prisma, tripId);
  await assertContractOnTrip(prisma, tripId, input.contractId);
  const snap = await resolveActivity(prisma, input, role, true);
  const clean = stripCommercials(input, role);
  const row = await prisma.$transaction(async tx => {
    const b = await tx.activityBooking.create({
      data: { ...clean, ...snap, tripId, name: (snap.name as string | undefined) ?? input.name!, date: dayDate(input.date)!, status: 'REQUESTED', createdById: actorId ?? null } as Prisma.ActivityBookingUncheckedCreateInput,
      include: INCLUDE,
    });
    await audit(tx, { action: 'activity_booking_created', entityType: 'trip', entityId: tripId, userId: actorId, description: `Activity ${b.name} on ${input.date}${b.time ? ` ${b.time}` : ''} for ${b.adults + b.children} requested`, after: { activityBookingId: b.id, name: b.name, date: input.date } });
    await tripChanged(tx, tripId, 'activity_booking_created', actorId);
    return b;
  });
  return activityBookingDto(row, role);
}

export async function updateActivityBooking(id: string, patch: ActivityBookingUpdate, role: string | undefined, actorId?: string | null) {
  const before = await prisma.activityBooking.findUnique({ where: { id } });
  if (!before) throw notFound('Activity booking');
  await assertOpenTrip(prisma, before.tripId);
  if (patch.contractId !== undefined) await assertContractOnTrip(prisma, before.tripId, patch.contractId);
  if (patch.vendorId && !(await prisma.vendor.findUnique({ where: { id: patch.vendorId }, select: { id: true } }))) throw new AppError('VALIDATION_ERROR', 400, 'Vendor not found', { vendorId: 'Unknown vendor' });
  const clean = stripCommercials(patch, role);
  const reconfirm = before.status === 'CONFIRMED' ? needsReconfirmation({ ...before, date: isoDay(before.date) } as Record<string, unknown>, clean, RECONFIRM_FIELDS.activity) : [];
  const row = await prisma.$transaction(async tx => {
    const a = await tx.activityBooking.update({
      where: { id },
      data: { ...clean, ...(patch.date ? { date: dayDate(patch.date)! } : {}), ...(reconfirm.length ? { status: 'REQUESTED', confirmedAt: null } : {}) } as Prisma.ActivityBookingUncheckedUpdateInput,
      include: INCLUDE,
    });
    await audit(tx, { action: 'activity_booking_updated', entityType: 'trip', entityId: before.tripId, userId: actorId, description: `Activity ${a.name} updated${reconfirm.length ? ` — ${reconfirm.join(', ')} changed, needs re-confirmation` : ''}`, before: { activityBookingId: id, date: isoDay(before.date), time: before.time, status: before.status }, after: { date: isoDay(a.date), time: a.time, status: a.status } });
    await tripChanged(tx, before.tripId, 'activity_booking_updated', actorId);
    return a;
  });
  return activityBookingDto(row, role);
}

export async function setActivityBookingStatus(id: string, change: OpsStatusChange, role: string | undefined, actorId?: string | null) {
  const b = await prisma.activityBooking.findUnique({ where: { id } });
  if (!b) throw notFound('Activity booking');
  await assertOpenTrip(prisma, b.tripId);
  if (!canTransition(OPS_TRANSITIONS, b.status, change.status)) throw stateConflict(`A ${b.status.toLowerCase().replace('_', ' ')} booking cannot become ${change.status.toLowerCase().replace('_', ' ')}`);
  const confirmationNo = change.confirmationNo ?? b.confirmationNo;
  if (change.status === 'CONFIRMED' && !confirmationNo) throw new AppError('VALIDATION_ERROR', 400, 'Enter the confirmation / ticket number (or who confirmed it)', { confirmationNo: 'Required to confirm' });
  if (change.status === 'CANCELLED' && !change.reason) throw new AppError('VALIDATION_ERROR', 400, 'Give a reason for cancelling', { reason: 'Required' });
  const row = await prisma.$transaction(async tx => {
    const a = await tx.activityBooking.update({
      where: { id },
      data: { status: change.status, confirmationNo, ...(change.status === 'CONFIRMED' ? { confirmedAt: new Date() } : {}), ...(change.status === 'CANCELLED' ? { cancelReason: change.reason } : {}), ...(change.status === 'REQUESTED' ? { confirmedAt: null } : {}) },
      include: INCLUDE,
    });
    await audit(tx, { action: 'activity_booking_status', entityType: 'trip', entityId: b.tripId, userId: actorId, description: `Activity ${b.name}: ${b.status} → ${change.status}${change.reason ? ` — ${change.reason}` : ''}`, before: { activityBookingId: id, status: b.status }, after: { status: change.status, confirmationNo } });
    await tripChanged(tx, b.tripId, 'activity_booking_status', actorId);
    return a;
  });
  return activityBookingDto(row, role);
}
