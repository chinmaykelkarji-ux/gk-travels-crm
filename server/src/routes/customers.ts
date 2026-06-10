import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try { res.json(await prisma.customer.findMany({ orderBy: { createdAt: 'desc' } })); }
  catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const existed = await prisma.customer.findUnique({ where: { id: req.body.id }, select: { id: true } });
    const c = await prisma.customer.upsert({
      where:  { id: req.body.id },
      update: sanitize(req.body) as Parameters<typeof prisma.customer.update>[0]['data'],
      create: sanitize(req.body) as Parameters<typeof prisma.customer.create>[0]['data'],
    });

    if (!existed) {
      await logActivity(prisma, {
        action:      'customer_created',
        description: `Customer ${c.name} added${c.phone ? ` (${c.phone})` : ''}`,
        entityType:  'customer',
        entityId:    c.id,
        userId:      req.userId,
        after:       { name: c.name, phone: c.phone, email: c.email },
      });
    }

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
  // customerNumber is DB-generated only (sequence-backed) — never accept it
  // from the client on create or update.
  const { createdAt, updatedAt, customerNumber, ...rest } = body;
  return rest;
}

export default router;
