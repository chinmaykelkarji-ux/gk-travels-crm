import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { createReceivable } from '../services/financeService.js';
import { logActivity } from '../services/activityService.js';

const router = Router();
router.use(requireAuth);

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
    const { payments, tasks, ...data } = req.body;
    const existed = await prisma.trip.findUnique({ where: { id: data.id }, select: { id: true } });
    const trip = await prisma.trip.upsert({
      where:  { id: data.id },
      update: data,
      create: data,
    });

    // Brand-new priced trip → automatically raise its receivable + post to
    // the activity feed (Phase 1/2: every operational action reflects in finance).
    if (!existed) {
      if (trip.totalPayable && trip.totalPayable > 0) {
        await createReceivable({
          sourceType:    'trip',
          sourceId:      trip.id,
          tripId:        trip.id,
          customerId:    trip.customerId,
          customerName:  trip.customer,
          amount:        trip.totalPayable,
          gstAmount:     trip.gstAmount,
          taxableAmount: trip.taxableAmount,
          dueDate:       trip.departure ?? undefined,
          description:   `Trip ${trip.id} — ${trip.destination}`,
          createdBy:     req.userId,
        });
      }
      await logActivity(prisma, {
        type:       'trip_created',
        message:    `Trip ${trip.id} created for ${trip.customer} (${trip.destination})`,
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
    const { payments, tasks, id, createdAt, updatedAt, ...data } = req.body;
    const trip = await prisma.trip.update({ where: { id: req.params.id }, data });
    res.json(trip);
  } catch (err) {
    console.error('[trips PUT]', err);
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/trips/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.payment.updateMany({
      where: { tripId: req.params.id },
      data:  { tripId: null },
    });
    await prisma.task.updateMany({
      where: { tripId: req.params.id },
      data:  { tripId: null },
    });
    await prisma.trip.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[trips DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
