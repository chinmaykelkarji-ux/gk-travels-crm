import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try { res.json(await prisma.lead.findMany({ orderBy: { createdAt: 'desc' } })); }
  catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post('/', async (req, res) => {
  try {
    const lead = await prisma.lead.upsert({
      where:  { id: req.body.id },
      update: sanitize(req.body) as Parameters<typeof prisma.lead.update>[0]['data'],
      create: sanitize(req.body) as Parameters<typeof prisma.lead.create>[0]['data'],
    });
    res.status(201).json(lead);
  } catch (err) {
    console.error('[leads POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data:  sanitize(req.body) as Parameters<typeof prisma.lead.update>[0]['data'],
    });
    res.json(lead);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.lead.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

function sanitize(body: Record<string, unknown>) {
  const { createdAt, updatedAt, ...rest } = body;
  return rest;
}

export default router;
