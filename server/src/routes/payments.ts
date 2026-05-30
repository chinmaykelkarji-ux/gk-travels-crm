import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const all = await prisma.payment.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({
      customerPayments: all.filter(p => p.type === 'customer'),
      supplierPayments: all.filter(p => p.type === 'supplier'),
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post('/', async (req, res) => {
  try {
    const p = await prisma.payment.upsert({
      where:  { id: req.body.id },
      update: sanitize(req.body),
      create: sanitize(req.body),
    });
    res.status(201).json(p);
  } catch (err) {
    console.error('[payments POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const p = await prisma.payment.update({
      where: { id: req.params.id },
      data:  sanitize(req.body),
    });
    res.json(p);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.payment.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

function sanitize(body: Record<string, unknown>) {
  const { createdAt, updatedAt, trip, ...rest } = body;
  return rest;
}

export default router;
