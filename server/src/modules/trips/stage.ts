// ============================================================
// Trip stage: snapshot of the trip's real records → readiness checks →
// transitions. Side effects of a stage change: the classic status follows,
// booking contracts follow (on tour / completed / cancelled), and a READY
// trip that gains a blocker (a new unconfirmed hotel, a cancelled duty)
// drops back to CONFIRMING by itself, with a SYSTEM audit row.
// ============================================================

import type { TripStage as DbTripStage } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound } from '../../core/errors.js';
import { evaluateTransition, legacyStatusFor, readinessChecks, STAGE_LABEL, type TripSnapshot, type TripStage } from '../../../../src/shared/calc/tripStage.js';
import { passportStatus, travellerDisplayName } from '../../../../src/shared/calc/travellers.js';
import { istToday } from '../../../../src/shared/calc/istTime.js';
import { registerTripChangeHook, tripChanged } from '../operations/hooks.js';

export async function buildSnapshot(db: DbClient, tripId: string): Promise<TripSnapshot> {
  const t = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      stage: true, departure: true, returnDate: true, isInternational: true,
      travellers: { select: { traveller: { select: { firstName: true, lastName: true, title: true, displayName: true, passportExpiry: true } } } },
      hotelBookings: { select: { status: true, hotelName: true, checkIn: true } },
      vehicleAssignments: { select: { status: true, vehicleType: true, vehicleId: true, vehicleRegNo: true, driverId: true, driverName: true, startAt: true, vehicle: { select: { registrationNo: true } } } },
      activityBookings: { select: { status: true, name: true } },
      tickets: { select: { status: true, displayNumber: true, pnr: true, mode: true } },
    },
  });
  if (!t) throw notFound('Trip');
  return {
    stage: t.stage as TripStage, departure: t.departure, returnDate: t.returnDate, isInternational: t.isInternational, travellers: t.travellers.length,
    hotels: t.hotelBookings.map(h => ({ status: h.status, label: `${h.hotelName} (${h.checkIn.toISOString().slice(0, 10)})` })),
    vehicles: t.vehicleAssignments.map(v => ({ status: v.status, label: `${v.vehicle?.registrationNo ?? v.vehicleRegNo ?? v.vehicleType ?? 'Vehicle'} (${v.startAt.toISOString().slice(0, 10)})`, hasVehicle: !!(v.vehicleId || v.vehicleRegNo), hasDriver: !!(v.driverId || v.driverName) })),
    activities: t.activityBookings.map(a => ({ status: a.status, label: a.name })),
    tickets: t.tickets.map(k => ({ status: k.status, label: `${k.mode.toLowerCase()} ${k.pnr ?? k.displayNumber ?? ''}`.trim() })),
    passportProblems: t.travellers.filter(x => ['EXPIRED', 'INSUFFICIENT'].includes(passportStatus(x.traveller.passportExpiry, { travelDate: t.departure }))).map(x => travellerDisplayName(x.traveller)),
  };
}

/** Readiness for the workspace: checks plus what each allowed next stage would need. */
export async function readiness(db: DbClient, tripId: string) {
  const snap = await buildSnapshot(db, tripId);
  const today = istToday();
  const nextStages: TripStage[] = ({ PLANNING: ['CONFIRMING', 'CANCELLED'], CONFIRMING: ['READY', 'PLANNING', 'CANCELLED'], READY: ['ONGOING', 'CONFIRMING', 'CANCELLED'], ONGOING: ['COMPLETED'], COMPLETED: [], CANCELLED: ['PLANNING'] } as Record<TripStage, TripStage[]>)[snap.stage];
  return {
    stage: snap.stage,
    checks: readinessChecks(snap),
    transitions: nextStages.map(to => ({ to, ...evaluateTransition(snap, to, today) })),
  };
}

const CONTRACT_FOLLOWS: Partial<Record<TripStage, { from: ('CONFIRMED' | 'IN_PROGRESS')[]; to: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' }>> = {
  ONGOING:   { from: ['CONFIRMED'], to: 'IN_PROGRESS' },
  COMPLETED: { from: ['CONFIRMED', 'IN_PROGRESS'], to: 'COMPLETED' },
  CANCELLED: { from: ['CONFIRMED', 'IN_PROGRESS'], to: 'CANCELLED' },
};

/** Writes the stage and everything that follows from it. No checks — callers decide. */
export async function applyStage(tx: DbClient, tripId: string, from: TripStage, to: TripStage, reason: string | null, actorId: string | null | undefined, source: 'HUMAN' | 'SYSTEM' = 'HUMAN', detail = '') {
  const contracts = await tx.bookingContract.count({ where: { tripId, status: { not: 'CANCELLED' } } });
  await tx.trip.update({
    where: { id: tripId },
    data: { stage: to as DbTripStage, stageChangedAt: new Date(), status: legacyStatusFor(to, contracts > 0), ...(to === 'CANCELLED' ? { cancelReason: reason } : from === 'CANCELLED' ? { cancelReason: null } : {}) },
  });
  const follow = CONTRACT_FOLLOWS[to];
  if (follow) {
    await tx.bookingContract.updateMany({
      where: { tripId, status: { in: follow.from } },
      data: { status: follow.to, ...(follow.to === 'COMPLETED' ? { completedAt: new Date() } : {}), ...(follow.to === 'CANCELLED' ? { cancelledAt: new Date(), cancellationReason: reason ? `Trip cancelled: ${reason}` : 'Trip cancelled' } : {}) },
    });
  }
  await audit(tx, {
    action: 'trip_stage_changed', entityType: 'trip', entityId: tripId, userId: source === 'SYSTEM' ? null : actorId, source,
    description: `Trip ${tripId}: ${STAGE_LABEL[from]} → ${STAGE_LABEL[to]}${reason ? ` — ${reason}` : ''}${detail}`, before: { stage: from }, after: { stage: to },
  });
  await tripChanged(tx, tripId, 'trip_stage', actorId);
}

export async function changeStage(tripId: string, to: TripStage, reason: string | null, actorId?: string | null) {
  return prisma.$transaction(async tx => {
    // Serialise stage changes of one trip.
    await tx.$queryRaw`SELECT "id" FROM "trips" WHERE "id" = ${tripId} FOR UPDATE`;
    const snap = await buildSnapshot(tx, tripId);
    if (snap.stage === to) return snap.stage;
    if (to === 'CANCELLED' && !reason) throw new AppError('VALIDATION_ERROR', 400, 'Give a reason for cancelling the trip', { reason: 'Required' });
    const result = evaluateTransition(snap, to, istToday());
    if (!result.allowed) {
      throw new AppError('STATE_CONFLICT', 409, `Cannot move to ${STAGE_LABEL[to]}: ${result.blockers.map(b => b.message).join('; ')}`, Object.fromEntries(result.blockers.map(b => [b.code, [b.message, ...(b.items ?? [])].join(' — ')])));
    }
    await applyStage(tx, tripId, snap.stage, to, reason, actorId);
    return to;
  });
}

// ── Readiness guard: READY cannot coexist with a blocker ──────

registerTripChangeHook('readiness', async (tx, tripId, reason, actorId) => {
  if (reason === 'trip_stage') return;
  const t = await tx.trip.findUnique({ where: { id: tripId }, select: { stage: true } });
  if (t?.stage !== 'READY') return;
  const blockers = readinessChecks(await buildSnapshot(tx, tripId)).filter(c => c.severity === 'block');
  if (!blockers.length) return;
  await applyStage(tx, tripId, 'READY', 'CONFIRMING', null, actorId, 'SYSTEM', ` — no longer ready: ${blockers.map(b => b.message).join('; ')}`);
});
