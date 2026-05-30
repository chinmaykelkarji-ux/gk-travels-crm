import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

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
router.post('/', async (req, res) => {
  try {
    const { payments, tasks, ...data } = req.body;
    const trip = await prisma.trip.upsert({
      where:  { id: data.id },
      update: data,
      create: data,
    });
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
