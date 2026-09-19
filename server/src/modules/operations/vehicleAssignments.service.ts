// ============================================================
// Vehicle assignments: which vehicle and driver serve which part of a trip,
// from when to when, pickup and drop. A vehicle or driver can never be on
// two overlapping duties: the check runs inside the transaction after
// locking the vehicle and driver rows, so two simultaneous saves cannot both
// pass. A vehicle whose papers lapse before the duty ends is refused.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { ASSIGNMENT_TRANSITIONS, canTransition, findScheduleConflicts, needsReconfirmation, RECONFIRM_FIELDS, type Slot } from '../../../../src/shared/calc/operations.js';
import { lapsesDuring } from '../../../../src/shared/calc/compliance.js';
import { istClock, istDay, toIstLocal } from '../../../../src/shared/calc/istTime.js';
import type { AssignmentStatusChange, VehicleAssignmentInput, VehicleAssignmentUpdate } from '../../../../src/shared/contracts/operations.js';
import { vehicleDocs } from '../masters/fleet.service.js';
import { assertOpenTrip, assertContractOnTrip, stripCommercials, money, isoDay } from './common.js';
import { tripChanged } from './hooks.js';

const INCLUDE = {
  vehicle: { select: { id: true, registrationNo: true, type: true, seats: true } },
  driver: { select: { id: true, name: true, phone: true } },
  vendor: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.VehicleAssignmentInclude;
type Row = Prisma.VehicleAssignmentGetPayload<{ include: typeof INCLUDE }>;

export function assignmentDto(a: Row, role: string | undefined) {
  return {
    id: a.id, tripId: a.tripId, contractId: a.contractId, vehicleId: a.vehicleId, vehicle: a.vehicle, driverId: a.driverId, driver: a.driver, vendorId: a.vendorId, vendor: a.vendor,
    vehicleType: a.vehicleType, seatsRequired: a.seatsRequired, vehicleRegNo: a.vehicleRegNo, driverName: a.driverName, driverPhone: a.driverPhone,
    startAt: a.startAt.toISOString(), endAt: a.endAt.toISOString(), startLocal: toIstLocal(a.startAt), endLocal: toIstLocal(a.endAt), day: istDay(a.startAt), pickupTime: istClock(a.startAt),
    pickupPoint: a.pickupPoint, dropPoint: a.dropPoint, route: a.route, pax: a.pax, status: a.status, driverStatus: a.driverStatus,
    driverStatusAt: a.driverStatusAt?.toISOString() ?? null, driverNote: a.driverNote, confirmationNo: a.confirmationNo,
    ...money(role, a.costAmount, a.sellAmount), customerNotes: a.customerNotes, internalNotes: a.internalNotes,
    /** Who drives, whether from the masters or as sent by the cab owner. */
    driverLabel: a.driver ? `${a.driver.name} · ${a.driver.phone}` : a.driverName ? `${a.driverName}${a.driverPhone ? ` · ${a.driverPhone}` : ''}` : null,
    vehicleLabel: a.vehicle ? `${a.vehicle.registrationNo} · ${a.vehicle.type}` : a.vehicleRegNo ? `${a.vehicleRegNo}${a.vehicleType ? ` · ${a.vehicleType}` : ''}` : a.vehicleType,
    legacyBookingId: a.legacyBookingId, createdAt: a.createdAt.toISOString(),
  };
}
export type AssignmentDto = ReturnType<typeof assignmentDto>;

export async function listAssignments(tripId: string, role: string | undefined) {
  const rows = await prisma.vehicleAssignment.findMany({ where: { tripId }, orderBy: { startAt: 'asc' }, include: INCLUDE });
  return rows.map(r => assignmentDto(r, role));
}

/** Everything on the road in a window (fleet calendar, Today). */
export async function schedule(fromIso: string, toIso: string, role: string | undefined) {
  const rows = await prisma.vehicleAssignment.findMany({
    where: { status: { not: 'CANCELLED' }, startAt: { lt: new Date(toIso) }, endAt: { gt: new Date(fromIso) } },
    orderBy: { startAt: 'asc' }, include: { ...INCLUDE, trip: { select: { id: true, destination: true, customer: true } } },
  });
  return rows.map(r => ({ ...assignmentDto(r, role), trip: r.trip }));
}

// ── Conflict + compliance checks ──────────────────────────────

async function busySlots(db: DbClient, vehicleId: string | null | undefined, driverId: string | null | undefined, startAt: string, endAt: string): Promise<Slot[]> {
  const or: Prisma.VehicleAssignmentWhereInput[] = [];
  if (vehicleId) or.push({ vehicleId });
  if (driverId) or.push({ driverId });
  if (!or.length) return [];
  const rows = await db.vehicleAssignment.findMany({
    where: { status: { not: 'CANCELLED' }, OR: or, startAt: { lt: new Date(endAt) }, endAt: { gt: new Date(startAt) } },
    select: { id: true, vehicleId: true, driverId: true, startAt: true, endAt: true, tripId: true, trip: { select: { destination: true } } },
  });
  return rows.map(r => ({ id: r.id, vehicleId: r.vehicleId, driverId: r.driverId, startAt: r.startAt.toISOString(), endAt: r.endAt.toISOString(), label: `${r.tripId} ${r.trip.destination}` }));
}

export async function checkConflicts(q: { vehicleId?: string; driverId?: string; startAt: string; endAt: string; excludeId?: string }) {
  const slots = await busySlots(prisma, q.vehicleId, q.driverId, q.startAt, q.endAt);
  return findScheduleConflicts({ id: q.excludeId, vehicleId: q.vehicleId, driverId: q.driverId, startAt: q.startAt, endAt: q.endAt }, slots)
    .map(c => ({ resource: c.resource, assignmentId: c.with.id, trip: c.with.label, startLocal: toIstLocal(c.with.startAt), endLocal: toIstLocal(c.with.endAt) }));
}

/** Locks the vehicle and driver rows, then refuses overlaps and lapsed papers. Returns non-blocking warnings. */
async function assertSchedulable(tx: DbClient, c: { id?: string; vehicleId?: string | null; driverId?: string | null; startAt: string; endAt: string; pax: number; seatsRequired?: number | null }): Promise<string[]> {
  const warnings: string[] = [];
  if (c.vehicleId) await tx.$queryRaw`SELECT "id" FROM "vehicles" WHERE "id" = ${c.vehicleId} FOR UPDATE`;
  if (c.driverId) await tx.$queryRaw`SELECT "id" FROM "drivers" WHERE "id" = ${c.driverId} FOR UPDATE`;
  const conflicts = findScheduleConflicts({ id: c.id, vehicleId: c.vehicleId, driverId: c.driverId, startAt: c.startAt, endAt: c.endAt }, await busySlots(tx, c.vehicleId, c.driverId, c.startAt, c.endAt));
  if (conflicts.length) {
    const first = conflicts[0];
    throw new AppError('CONFLICT', 409, `This ${first.resource} is already on duty for ${first.with.label} (${toIstLocal(first.with.startAt)?.replace('T', ' ')} → ${toIstLocal(first.with.endAt)?.replace('T', ' ')})`,
      { [first.resource === 'vehicle' ? 'vehicleId' : 'driverId']: `Busy with ${first.with.label}`, conflictingAssignmentId: first.with.id ?? '' });
  }
  const endDay = istDay(c.endAt)!;
  if (c.vehicleId) {
    const v = await tx.vehicle.findUnique({ where: { id: c.vehicleId } });
    if (!v) throw new AppError('VALIDATION_ERROR', 400, 'Vehicle not found', { vehicleId: 'Unknown vehicle' });
    if (!v.isActive) throw new AppError('VALIDATION_ERROR', 400, `${v.registrationNo} is marked inactive`, { vehicleId: 'Inactive vehicle' });
    const lapsed = lapsesDuring(vehicleDocs(v), endDay);
    if (lapsed.length) throw new AppError('VALIDATION_ERROR', 400, `${v.registrationNo}: ${lapsed.join(', ')} expire(s) before this duty ends`, { vehicleId: `Papers lapse: ${lapsed.join(', ')}` });
    const docs = vehicleDocs(v);
    const missing = Object.entries(docs).filter(([, d]) => !d).map(([k]) => k);
    if (missing.length) warnings.push(`${v.registrationNo}: ${missing.join(', ')} not on file`);
    const need = Math.max(c.pax, c.seatsRequired ?? 0);
    if (need > v.seats) warnings.push(`${v.registrationNo} has ${v.seats} seats for ${need} passengers`);
  }
  if (c.driverId) {
    const d = await tx.driver.findUnique({ where: { id: c.driverId } });
    if (!d) throw new AppError('VALIDATION_ERROR', 400, 'Driver not found', { driverId: 'Unknown driver' });
    if (!d.isActive) throw new AppError('VALIDATION_ERROR', 400, `${d.name} is marked inactive`, { driverId: 'Inactive driver' });
    if (d.licenceExpiry && isoDay(d.licenceExpiry)! < endDay) throw new AppError('VALIDATION_ERROR', 400, `${d.name}'s licence expires ${isoDay(d.licenceExpiry)}, before this duty ends`, { driverId: 'Licence lapses' });
    if (!d.licenceExpiry) warnings.push(`${d.name}: licence expiry not on file`);
  }
  return warnings;
}

// ── Writes ────────────────────────────────────────────────────

async function defaultsFromVehicle(db: DbClient, vehicleId: string | null | undefined, vendorId: string | null | undefined) {
  if (!vehicleId || vendorId) return {};
  const v = await db.vehicle.findUnique({ where: { id: vehicleId }, select: { vendorId: true } });
  return v?.vendorId ? { vendorId: v.vendorId } : {};
}

export async function createAssignment(tripId: string, input: VehicleAssignmentInput, role: string | undefined, actorId?: string | null) {
  await assertOpenTrip(prisma, tripId);
  await assertContractOnTrip(prisma, tripId, input.contractId);
  const clean = stripCommercials(input, role);
  const extra = await defaultsFromVehicle(prisma, input.vehicleId, input.vendorId);
  const { row, warnings } = await prisma.$transaction(async tx => {
    const warnings = await assertSchedulable(tx, input);
    const a = await tx.vehicleAssignment.create({
      data: { ...clean, ...extra, tripId, startAt: new Date(input.startAt), endAt: new Date(input.endAt), status: 'REQUESTED', createdById: actorId ?? null } as Prisma.VehicleAssignmentUncheckedCreateInput,
      include: INCLUDE,
    });
    await audit(tx, { action: 'vehicle_assigned', entityType: 'trip', entityId: tripId, userId: actorId, description: `Vehicle ${a.vehicle?.registrationNo ?? a.vehicleType ?? ''} ${toIstLocal(a.startAt)?.replace('T', ' ')} → ${toIstLocal(a.endAt)?.replace('T', ' ')}${a.driver ? `, driver ${a.driver.name}` : ''}`, after: { assignmentId: a.id, vehicleId: a.vehicleId, driverId: a.driverId, startAt: input.startAt, endAt: input.endAt } });
    await tripChanged(tx, tripId, 'vehicle_assigned', actorId);
    return { row: a, warnings };
  });
  return { ...assignmentDto(row, role), warnings };
}

export async function updateAssignment(id: string, patch: VehicleAssignmentUpdate, role: string | undefined, actorId?: string | null) {
  const before = await prisma.vehicleAssignment.findUnique({ where: { id } });
  if (!before) throw notFound('Vehicle assignment');
  await assertOpenTrip(prisma, before.tripId);
  if (patch.contractId !== undefined) await assertContractOnTrip(prisma, before.tripId, patch.contractId);
  const merged = {
    id, vehicleId: patch.vehicleId !== undefined ? patch.vehicleId : before.vehicleId, driverId: patch.driverId !== undefined ? patch.driverId : before.driverId,
    startAt: patch.startAt ?? before.startAt.toISOString(), endAt: patch.endAt ?? before.endAt.toISOString(), pax: patch.pax ?? before.pax, seatsRequired: patch.seatsRequired !== undefined ? patch.seatsRequired : before.seatsRequired,
  };
  if (merged.endAt <= merged.startAt) throw new AppError('VALIDATION_ERROR', 400, 'End must be after start', { endAt: 'After start' });
  const clean = stripCommercials(patch, role);
  const cmp = { ...before, startAt: before.startAt.toISOString(), endAt: before.endAt.toISOString() } as Record<string, unknown>;
  const reconfirm = before.status === 'CONFIRMED' ? needsReconfirmation(cmp, clean, RECONFIRM_FIELDS.vehicle) : [];
  const crewChanged = (patch.vehicleId !== undefined && patch.vehicleId !== before.vehicleId) || (patch.driverId !== undefined && patch.driverId !== before.driverId);
  const { row, warnings } = await prisma.$transaction(async tx => {
    const warnings = await assertSchedulable(tx, merged);
    const a = await tx.vehicleAssignment.update({
      where: { id },
      data: {
        ...clean, ...(patch.startAt ? { startAt: new Date(patch.startAt) } : {}), ...(patch.endAt ? { endAt: new Date(patch.endAt) } : {}),
        ...(reconfirm.length ? { status: 'REQUESTED' } : {}),
        ...(crewChanged || reconfirm.length ? { driverStatus: 'ASSIGNED', driverStatusAt: null, driverNote: null } : {}),
      } as Prisma.VehicleAssignmentUncheckedUpdateInput,
      include: INCLUDE,
    });
    await audit(tx, {
      action: 'vehicle_assignment_updated', entityType: 'trip', entityId: before.tripId, userId: actorId,
      description: `Vehicle duty ${a.vehicle?.registrationNo ?? a.vehicleType ?? ''} updated${reconfirm.length ? ` — ${reconfirm.join(', ')} changed, needs re-confirmation` : ''}`,
      before: { assignmentId: id, vehicleId: before.vehicleId, driverId: before.driverId, startAt: before.startAt, endAt: before.endAt, status: before.status },
      after: { vehicleId: a.vehicleId, driverId: a.driverId, startAt: a.startAt, endAt: a.endAt, status: a.status },
    });
    await tripChanged(tx, before.tripId, 'vehicle_assignment_updated', actorId);
    return { row: a, warnings };
  });
  return { ...assignmentDto(row, role), warnings };
}

export async function setAssignmentStatus(id: string, change: AssignmentStatusChange, role: string | undefined, actorId?: string | null) {
  const a = await prisma.vehicleAssignment.findUnique({ where: { id } });
  if (!a) throw notFound('Vehicle assignment');
  await assertOpenTrip(prisma, a.tripId);
  if (!canTransition(ASSIGNMENT_TRANSITIONS, a.status, change.status)) throw stateConflict(`A ${a.status.toLowerCase()} duty cannot become ${change.status.toLowerCase()}`);
  if (change.status === 'CONFIRMED' && !a.vehicleId && !a.vehicleRegNo) throw new AppError('VALIDATION_ERROR', 400, 'Choose the vehicle (or enter its number from the cab owner) before confirming', { vehicleId: 'Required to confirm' });
  if (change.status === 'COMPLETED' && a.startAt > new Date()) throw stateConflict('A duty cannot be completed before it starts');
  if (change.status === 'CANCELLED' && !change.reason) throw new AppError('VALIDATION_ERROR', 400, 'Give a reason for cancelling', { reason: 'Required' });
  const row = await prisma.$transaction(async tx => {
    if (change.status === 'REQUESTED' || change.status === 'CONFIRMED') {
      // Re-activating a cancelled duty must not double-book.
      if (a.status === 'CANCELLED') await assertSchedulable(tx, { id, vehicleId: a.vehicleId, driverId: a.driverId, startAt: a.startAt.toISOString(), endAt: a.endAt.toISOString(), pax: a.pax, seatsRequired: a.seatsRequired });
    }
    const u = await tx.vehicleAssignment.update({
      where: { id },
      data: { status: change.status, confirmationNo: change.confirmationNo ?? a.confirmationNo, ...(change.status === 'CANCELLED' ? { cancelReason: change.reason, cancelledAt: new Date() } : {}) },
      include: INCLUDE,
    });
    await audit(tx, { action: 'vehicle_assignment_status', entityType: 'trip', entityId: a.tripId, userId: actorId, description: `Vehicle duty ${u.vehicle?.registrationNo ?? u.vehicleType ?? ''}: ${a.status} → ${change.status}${change.reason ? ` — ${change.reason}` : ''}`, before: { assignmentId: id, status: a.status }, after: { status: change.status } });
    await tripChanged(tx, a.tripId, 'vehicle_assignment_status', actorId);
    return u;
  });
  return assignmentDto(row, role);
}
