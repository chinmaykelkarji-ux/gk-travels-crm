// ============================================================
// Driver view. A DRIVER login is linked to one driver record and sees only
// the confirmed duties assigned to that driver, with the minimum needed to
// do the job: when and where, the vehicle, how many passengers, the group
// contact and — on the day the tour sets off — the pickup points with the
// names to collect at each. Never amounts, suppliers, identity numbers,
// dates of birth, e-mails or office notes. Status updates are audited; an
// ISSUE raises an urgent task for the trip's operations owner.
// ============================================================

import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { canMoveDriverStatus, type DriverDutyStatus } from '../../../../src/shared/calc/operations.js';
import { istDay, istToday, toIstLocal } from '../../../../src/shared/calc/istTime.js';
import { travellerDisplayName } from '../../../../src/shared/calc/travellers.js';
import type { DriverDutiesQuery, DriverStatusChange } from '../../../../src/shared/contracts/driver.js';
import { tripChanged } from '../operations/hooks.js';

const STATUS_LABEL: Record<DriverDutyStatus, string> = { ASSIGNED: 'Assigned', ACKNOWLEDGED: 'Acknowledged', STARTED: 'On the way', ARRIVED: 'Arrived at pickup', ON_BOARD: 'Passengers on board', COMPLETED: 'Completed', ISSUE: 'Problem reported' };

async function myDriver(userId: string | undefined) {
  const d = userId ? await prisma.driver.findFirst({ where: { userId, isActive: true }, select: { id: true, name: true, phone: true } }) : null;
  if (!d) throw new AppError('FORBIDDEN', 403, 'This login is not linked to a driver. Ask the office to link it.');
  return d;
}

export async function myDuties(userId: string | undefined, q: DriverDutiesQuery, now = new Date()) {
  const driver = await myDriver(userId);
  const from = new Date(now.getTime() - 12 * 3_600_000);
  const rows = await prisma.vehicleAssignment.findMany({
    where: {
      driverId: driver.id,
      ...(q.range === 'current' ? { status: 'CONFIRMED', endAt: { gte: from } } : { status: { in: ['CONFIRMED', 'COMPLETED'] }, endAt: { lt: now, gte: new Date(now.getTime() - 30 * 86_400_000) } }),
    },
    orderBy: { startAt: q.range === 'current' ? 'asc' : 'desc' },
    take: 50,
    include: {
      vehicle: { select: { registrationNo: true, type: true, seats: true } },
      trip: {
        select: {
          id: true, tourName: true, destination: true, customer: true, phone: true, departure: true,
          pickupPoints: { orderBy: { seq: 'asc' }, select: { id: true, name: true, landmark: true, address: true, pickupAt: true, mapUrl: true, contactName: true, contactPhone: true } },
          travellers: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { pickupPointId: true, traveller: { select: { title: true, firstName: true, lastName: true, displayName: true } } } },
        },
      },
    },
  });
  const company = await prisma.companySettings.findFirst({ select: { phone: true } });
  return {
    driver: { name: driver.name },
    officePhone: company?.phone ?? null,
    duties: rows.map(a => {
      const t = a.trip;
      // Pickup points (with names) only for the duty that collects the group on the day the tour sets off.
      const collection = !!t.departure && istDay(a.startAt) === t.departure && t.pickupPoints.length > 0;
      return {
        id: a.id, tripId: t.id, tripLabel: t.tourName ?? t.destination,
        startLocal: toIstLocal(a.startAt)!, endLocal: toIstLocal(a.endAt)!, isToday: istDay(a.startAt) === istToday(now),
        pickupPoint: a.pickupPoint, dropPoint: a.dropPoint, route: a.route, pax: a.pax,
        vehicle: a.vehicle ? `${a.vehicle.registrationNo} · ${a.vehicle.type}` : [a.vehicleRegNo, a.vehicleType].filter(Boolean).join(' · ') || null,
        instructions: a.customerNotes, status: a.status, driverStatus: a.driverStatus, driverStatusLabel: STATUS_LABEL[a.driverStatus as DriverDutyStatus], driverStatusAt: a.driverStatusAt?.toISOString() ?? null, driverNote: a.driverNote,
        groupContact: { name: t.customer, phone: t.phone },
        pickupPoints: collection ? t.pickupPoints.map(p => ({
          name: p.name, time: toIstLocal(p.pickupAt), landmark: p.landmark, address: p.address, mapUrl: p.mapUrl, contactName: p.contactName, contactPhone: p.contactPhone,
          passengers: t.travellers.filter(x => x.pickupPointId === p.id).map(x => travellerDisplayName(x.traveller)),
        })) : [],
        unassignedPassengers: collection ? t.travellers.filter(x => !x.pickupPointId).length : 0,
      };
    }),
  };
}
export type DriverDuties = Awaited<ReturnType<typeof myDuties>>;

export async function updateMyDuty(userId: string | undefined, id: string, input: DriverStatusChange) {
  const driver = await myDriver(userId);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "vehicle_assignments" WHERE "id" = ${id} FOR UPDATE`;
    const a = await tx.vehicleAssignment.findUnique({ where: { id }, include: { trip: { select: { id: true, tourName: true, destination: true, assignedOpsUserId: true, customerId: true } } } });
    // Someone else's duty looks the same as a missing one.
    if (!a || a.driverId !== driver.id) throw notFound('Duty');
    if (a.status !== 'CONFIRMED') throw stateConflict('This duty is not active. Call the office.');
    const from = a.driverStatus as DriverDutyStatus;
    if (!canMoveDriverStatus(from, input.status)) throw stateConflict(`Cannot go from "${STATUS_LABEL[from]}" to "${STATUS_LABEL[input.status]}"`);
    const now = new Date();
    await tx.vehicleAssignment.update({
      where: { id },
      data: { driverStatus: input.status, driverStatusAt: now, driverNote: input.note ?? (input.status === 'ISSUE' ? a.driverNote : null), ...(input.status === 'COMPLETED' ? { status: 'COMPLETED' } : {}) },
    });
    const label = a.trip.tourName ?? a.trip.destination;
    await audit(tx, {
      action: 'driver_status', entityType: 'trip', entityId: a.tripId, userId,
      description: `Driver ${driver.name}: ${STATUS_LABEL[from]} → ${STATUS_LABEL[input.status]} (${toIstLocal(a.startAt)!.replace('T', ' ')})${input.note ? ` — ${input.note}` : ''}`,
      before: { driverStatus: from }, after: { driverStatus: input.status, note: input.note, assignmentId: id },
    });
    if (input.status === 'ISSUE') {
      const owner = a.trip.assignedOpsUserId ? await tx.user.findUnique({ where: { id: a.trip.assignedOpsUserId }, select: { id: true, name: true } }) : null;
      const task = await tx.task.create({
        data: {
          id: `SYS-TSK-${randomUUID().slice(0, 12)}`, source: 'SYSTEM', title: `Driver reported a problem: ${label} — ${driver.name}`,
          description: `${input.note}\nDuty ${toIstLocal(a.startAt)!.replace('T', ' ')}, ${[a.pickupPoint, a.dropPoint].filter(Boolean).join(' → ')}. Driver phone ${driver.phone}.`,
          priority: 'urgent', status: 'pending', tripId: a.tripId, customerId: a.trip.customerId, entityType: 'vehicle_assignment', entityId: a.id,
          dueAt: now, dueDate: istDay(now), createdDate: istToday(now), assignedToUserId: owner?.id ?? null, assignedTo: owner?.name ?? null,
        },
      });
      await audit(tx, { action: 'task_created', entityType: 'task', entityId: task.id, source: 'SYSTEM', description: `Task created from a driver report: ${task.title}` });
    }
    await tripChanged(tx, a.tripId, 'driver_status', userId);
  });
  return myDuties(userId, { range: 'current' });
}
