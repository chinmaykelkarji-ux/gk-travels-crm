import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try { res.json(await prisma.customer.findMany({ orderBy: { createdAt: 'desc' } })); }
  catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post('/', async (req, res) => {
  try {
    const c = await prisma.customer.upsert({
      where:  { id: req.body.id },
      update: sanitize(req.body) as Parameters<typeof prisma.customer.update>[0]['data'],
      create: sanitize(req.body) as Parameters<typeof prisma.customer.create>[0]['data'],
    });
    res.status(201).json(c);
  } catch (err) {
    console.error('[customers POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const c = await prisma.customer.update({
      where: { id: req.params.id },
      data:  sanitize(req.body) as Parameters<typeof prisma.customer.update>[0]['data'],
    });
    res.json(c);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.customer.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

function sanitize(body: Record<string, unknown>) {
  const { createdAt, updatedAt, ...rest } = body;
  return rest;
}

export default router;
