import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    res.json(await prisma.booking.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (err) {
    console.error('BOOKING API ERROR:', err);
    if (err instanceof Error) {
      console.error('MESSAGE:', err.message);
      console.error('STACK:', err.stack);
    }
    res.status(500).json({
      error: 'Booking API failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post('/', async (req, res) => {
  try {
    const b = await prisma.booking.upsert({
      where:  { id: req.body.id },
      update: sanitize(req.body),
      create: sanitize(req.body),
    });
    res.status(201).json(b);
  } catch (err) {
    console.error('BOOKING API ERROR:', err);
    if (err instanceof Error) {
      console.error('MESSAGE:', err.message);
      console.error('STACK:', err.stack);
    }
    res.status(500).json({
      error: 'Booking API failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const b = await prisma.booking.update({
      where: { id: req.params.id },
      data:  sanitize(req.body),
    });
    res.json(b);
  } catch (err) {
    console.error('BOOKING API ERROR:', err);
    if (err instanceof Error) {
      console.error('MESSAGE:', err.message);
      console.error('STACK:', err.stack);
    }
    res.status(500).json({
      error: 'Booking API failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.booking.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('BOOKING API ERROR:', err);
    if (err instanceof Error) {
      console.error('MESSAGE:', err.message);
      console.error('STACK:', err.stack);
    }
    res.status(500).json({
      error: 'Booking API failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

function sanitize(body: Record<string, unknown>) {
  const { createdAt, updatedAt, ...rest } = body;
  return rest;
}

export default router;
