import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';

const router = Router();
router.use(requireAuth);

// Leads belong to the sales pipeline — same permission as enquiries.

router.get('/', requirePermission('enquiries:read'), async (_req, res) => {
  try { res.json(await prisma.lead.findMany({ orderBy: { createdAt: 'desc' } })); }
  catch (err) {
    console.error('[leads GET]', err);
    res.status(500).json({ error: 'Failed to load leads' });
  }
});

router.post('/', requirePermission('enquiries:write'), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (typeof body.id !== 'string' || !body.id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const lead = await prisma.lead.upsert({
      where:  { id: body.id },
      update: sanitize(body) as Parameters<typeof prisma.lead.update>[0]['data'],
      create: sanitize(body) as Parameters<typeof prisma.lead.create>[0]['data'],
    });
    res.status(201).json(lead);
  } catch (err) {
    console.error('[leads POST]', err);
    res.status(500).json({ error: 'Failed to save lead' });
  }
});

router.put('/:id', requirePermission('enquiries:write'), async (req, res) => {
  try {
    const lead = await prisma.lead.update({
      where: { id: String(req.params.id) },
      data:  sanitize(req.body as Record<string, unknown>) as Parameters<typeof prisma.lead.update>[0]['data'],
    });
    res.json(lead);
  } catch (err) {
    console.error('[leads PUT]', err);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

router.delete('/:id', requirePermission('enquiries:write'), async (req, res) => {
  try {
    await prisma.lead.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[leads DELETE]', err);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

function sanitize(body: Record<string, unknown>) {
  const { createdAt, updatedAt, ...rest } = body;
  return rest;
}

export default router;
