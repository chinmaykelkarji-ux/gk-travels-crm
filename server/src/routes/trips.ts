import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';
import { logActivity } from '../lib/activity.js';

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

// GET /api/trips
router.get('/', async (_req, res) => {
  try {
    res.json(await prisma.trip.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// GET /api/trips/:id
router.get('/:id', async (req, res) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(trip);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// POST /api/trips
router.post('/', async (req: AuthRequest, res) => {
  try {
    // tripNumber is DB-generated only (sequence-backed) — never accept it
    // from the client on create or update.
    const { payments, tasks, tripNumber, ...rest } = req.body;
    const id   = (rest.id as string | undefined) || await nextTripId();
    const data = {
      createdDate: new Date().toISOString().split('T')[0],
      ...rest,
      id,
    };

    const existed = await prisma.trip.findUnique({ where: { id }, select: { id: true } });
    const trip = await prisma.trip.upsert({
      where:  { id },
      update: data,
      create: data,
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
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/trips/:id
router.put('/:id', async (req, res) => {
  try {
    const { payments, tasks, id, createdAt, updatedAt, tripNumber, ...data } = req.body;
    const trip = await prisma.trip.update({ where: { id: req.params.id }, data });
    res.json(trip);
  } catch (err) {
    console.error('[trips PUT]', err);
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/trips/:id
router.delete('/:id', requirePermission('trips:write'), async (req, res) => {
  try {
    const { id } = req.params;

    const trip = await prisma.trip.findUnique({ where: { id }, select: { id: true } });
    if (!trip) { res.status(404).json({ error: 'Trip not found' }); return; }

    // Financial records must be preserved — block deletion while invoices
    // reference this trip rather than silently orphaning them.
    const invoiceCount = await prisma.invoice.count({
      where: { tripIds: { array_contains: id } },
    });
    if (invoiceCount > 0) {
      res.status(409).json({
        error: `Cannot delete trip — ${invoiceCount} invoice(s) reference this trip. Cancel or remove those invoices first.`,
      });
      return;
    }

    // Unlink (but don't delete) payments/tasks recorded against this trip.
    await prisma.payment.updateMany({ where: { tripId: id }, data: { tripId: null } });
    await prisma.task.updateMany({ where: { tripId: id }, data: { tripId: null } });

    // A sales quote that was converted into this trip should survive the
    // trip's deletion — just clear the back-reference.
    await prisma.salesQuote.updateMany({
      where: { convertedTripId: id },
      data:  { convertedTripId: null },
    });

    // Trip services cascade-delete via the schema; everything else above
    // is unlinked, so the trip itself can now be removed.
    await prisma.trip.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[trips DELETE]', err);

    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2003' || err.code === 'P2014')) {
      res.status(409).json({ error: 'Cannot delete trip — related records still exist. Remove bookings, vouchers, or services first.' });
      return;
    }

    res.status(500).json({ error: 'Failed to delete trip', details: String(err) });
  }
});

export default router;
