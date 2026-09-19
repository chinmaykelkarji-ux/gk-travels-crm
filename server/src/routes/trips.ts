import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';
import { syncTripTravellersFromIds } from '../modules/travellers/service.js';
import { logActivity } from '../lib/activity.js';
import { redactTrip } from '../lib/redact.js';
import { stageForLegacyStatus, type TripStage } from '../../../src/shared/calc/tripStage.js';

const router = Router();
router.use(requireAuth);

// Mirrors src/shared/utils/id.ts nextTripId() — used when the client
// doesn't supply an id (e.g. direct API calls).
async function nextTripId(): Promise<string> {
  const year = new Date().getFullYear();
  const existing = await prisma.trip.findMany({
    where:  { id: { startsWith: `GK-${year}-` } },
    select: { id: true },
  });
  const seq = existing.reduce((max, t) => {
    const n = parseInt(t.id.split('-')[2], 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0) + 1;
  return `GK-${year}-${String(seq).padStart(4, '0')}`;
}

// Server-owned columns never come from the client: nested collections,
// timestamps, the DB-generated display number, and the invoice lock that
// invoiceService sets/clears.
function sanitize(body: Record<string, unknown>) {
  const {
    payments, tasks, services, createdAt, updatedAt, tripNumber, invoiceId,
    // v2-owned (trip control centre): stage via /api/v2/trips/:id/stage, relations via their own APIs.
    stage, stageChangedAt, cancelReason, tourName, isInternational, assignedOpsUserId, assignedOps,
    contracts, travellers, pickupPoints, hotelBookings, vehicleAssignments, activityBookings, tickets,
    ...rest
  } = body;
  return rest;
}

/** A classic status edit moves the stage too (no readiness checks: the classic screen predates them). */
async function followLegacyStatus(tx: DbClient, tripId: string, status: unknown, userId?: string) {
  if (typeof status !== 'string') return;
  const t = await tx.trip.findUnique({ where: { id: tripId }, select: { stage: true } });
  if (!t) return;
  const next = stageForLegacyStatus(status, t.stage as TripStage);
  if (!next) return;
  await tx.trip.update({ where: { id: tripId }, data: { stage: next, stageChangedAt: new Date() } });
  await logActivity(tx, { action: 'trip_stage_changed', entityType: 'trip', entityId: tripId, userId, description: `Trip ${tripId}: stage ${t.stage} → ${next} (status "${status}" set on the classic screen)`, before: { stage: t.stage }, after: { stage: next } });
}

// GET /api/trips — supplier cost / margin zeroed for non-commercial roles
router.get('/', requirePermission('trips:read'), async (req: AuthRequest, res) => {
  try {
    const rows = await prisma.trip.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(rows.map(t => redactTrip(t, req.userRole)));
  } catch (err) {
    console.error('[trips GET]', err);
    res.status(500).json({ error: 'Failed to load trips' });
  }
});

// GET /api/trips/:id
router.get('/:id', requirePermission('trips:read'), async (req: AuthRequest, res) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: String(req.params.id) } });
    if (!trip) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(redactTrip(trip, req.userRole));
  } catch (err) {
    console.error('[trips GET /:id]', err);
    res.status(500).json({ error: 'Failed to load trip' });
  }
});

// POST /api/trips
router.post('/', requirePermission('trips:write'), async (req: AuthRequest, res) => {
  try {
    const rest = sanitize(req.body as Record<string, unknown>);
    const id   = (rest.id as string | undefined) || await nextTripId();
    const data = {
      createdDate: new Date().toISOString().split('T')[0],
      ...rest,
      id,
    };

    const existed = await prisma.trip.findUnique({ where: { id }, select: { id: true } });
    const trip = await prisma.$transaction(async tx => {
      const saved = await tx.trip.upsert({
        where:  { id },
        update: data as Parameters<typeof prisma.trip.update>[0]['data'],
        create: data as Parameters<typeof prisma.trip.create>[0]['data'],
      });
      if (Array.isArray(rest.passengerIds)) await syncTripTravellersFromIds(tx, saved.id, rest.passengerIds);
      if (existed) await followLegacyStatus(tx, saved.id, rest.status, req.userId);
      else if (typeof rest.status === 'string') { const st = stageForLegacyStatus(rest.status, 'PLANNING'); if (st) await tx.trip.update({ where: { id: saved.id }, data: { stage: st } }); }
      return saved;
    });

    // Brand-new trip → post to the activity feed. Receivables are now raised
    // exclusively from GST Invoices (see invoiceService.createInvoice), not
    // automatically on trip creation.
    if (!existed) {
      await logActivity(prisma, {
        action:      'trip_created',
        description: `Trip ${trip.id} created for ${trip.customer} (${trip.destination})`,
        entityType: 'trip',
        entityId:   trip.id,
        userId:     req.userId,
        after:      trip,
      });
    }

    res.status(201).json(trip);
  } catch (err) {
    console.error('[trips POST]', err);
    res.status(500).json({ error: 'Failed to save trip' });
  }
});

// PUT /api/trips/:id
router.put('/:id', requirePermission('trips:write'), async (req: AuthRequest, res) => {
  try {
    const { id: _ignored, ...data } = sanitize(req.body as Record<string, unknown>);
    const trip = await prisma.$transaction(async tx => {
      const updated = await tx.trip.update({
        where: { id: String(req.params.id) },
        data:  data as Parameters<typeof prisma.trip.update>[0]['data'],
      });
      // Legacy screens edit passengerIds; keep trip_travellers (v2) in step.
      if (Array.isArray(data.passengerIds)) await syncTripTravellersFromIds(tx, updated.id, data.passengerIds);
      await followLegacyStatus(tx, updated.id, data.status, req.userId);
      return tx.trip.findUniqueOrThrow({ where: { id: updated.id } });
    });
    res.json(trip);
  } catch (err) {
    console.error('[trips PUT]', err);
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

// DELETE /api/trips/:id
router.delete('/:id', requirePermission('trips:write'), async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);

    const trip = await prisma.trip.findUnique({ where: { id }, select: { id: true, customer: true, destination: true } });
    if (!trip) { res.status(404).json({ error: 'Trip not found' }); return; }

    // Financial records must be preserved — block deletion while invoices
    // reference this trip rather than silently orphaning them.
    const invoiceCount = await prisma.invoice.count({
      where: { tripIds: { array_contains: id } },
    });
    // Supplier bookings and customer contracts are real commitments: cancel them, never delete them silently.
    const [contracts, hotels, vehicles, activities, tickets] = await Promise.all([
      prisma.bookingContract.count({ where: { tripId: id } }), prisma.hotelBooking.count({ where: { tripId: id } }),
      prisma.vehicleAssignment.count({ where: { tripId: id } }), prisma.activityBooking.count({ where: { tripId: id } }), prisma.ticket.count({ where: { tripId: id } }),
    ]);
    if (contracts + hotels + vehicles + activities + tickets > 0) {
      res.status(409).json({ error: `Cannot delete trip — it has ${[contracts && `${contracts} booking(s)`, hotels && `${hotels} hotel booking(s)`, vehicles && `${vehicles} vehicle duty(ies)`, activities && `${activities} activity booking(s)`, tickets && `${tickets} ticket(s)`].filter(Boolean).join(', ')}. Cancel the trip instead.` });
      return;
    }
    if (invoiceCount > 0) {
      res.status(409).json({
        error: `Cannot delete trip — ${invoiceCount} invoice(s) reference this trip. Cancel or remove those invoices first.`,
      });
      return;
    }

    await prisma.$transaction([
      // Unlink (but don't delete) payments/tasks recorded against this trip.
      prisma.payment.updateMany({ where: { tripId: id }, data: { tripId: null } }),
      prisma.task.updateMany({ where: { tripId: id }, data: { tripId: null } }),
      // A sales quote that was converted into this trip should survive the
      // trip's deletion — just clear the back-reference.
      prisma.salesQuote.updateMany({ where: { convertedTripId: id }, data: { convertedTripId: null } }),
      // Trip services cascade-delete via the schema.
      prisma.trip.delete({ where: { id } }),
    ]);

    await logActivity(prisma, {
      action:      'trip_deleted',
      description: `Trip ${id} (${trip.customer} — ${trip.destination}) deleted`,
      entityType:  'trip',
      entityId:    id,
      userId:      req.userId,
      before:      trip,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[trips DELETE]', err);

    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2003' || err.code === 'P2014')) {
      res.status(409).json({ error: 'Cannot delete trip — related records still exist. Remove bookings, vouchers, or services first.' });
      return;
    }

    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

export default router;
