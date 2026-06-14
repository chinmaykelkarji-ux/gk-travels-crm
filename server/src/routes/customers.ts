import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';
import { logActivity } from '../lib/activity.js';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('customers:read'), async (_req, res) => {
  try { res.json(await prisma.customer.findMany({ orderBy: { createdAt: 'desc' } })); }
  catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post('/', requirePermission('customers:write'), async (req: AuthRequest, res) => {
  try {
    const id   = (req.body.id as string | undefined) || await nextCustomerId();
    const data = {
      createdDate: new Date().toISOString().split('T')[0],
      ...sanitize(req.body),
      id,
    };

    const existed = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
    const c = await prisma.customer.upsert({
      where:  { id },
      update: data as Parameters<typeof prisma.customer.update>[0]['data'],
      create: data as Parameters<typeof prisma.customer.create>[0]['data'],
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

router.put('/:id', requirePermission('customers:write'), async (req, res) => {
  try {
    const c = await prisma.customer.update({
      where: { id: req.params.id },
      data:  sanitize(req.body) as Parameters<typeof prisma.customer.update>[0]['data'],
    });
    res.json(c);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.delete('/:id', requirePermission('customers:write'), async (req: AuthRequest, res) => {
  if (req.userRole !== 'ADMIN') {
    res.status(403).json({ error: 'Only administrators can delete customers' });
    return;
  }
  try {
    await prisma.customer.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// Mirrors src/shared/utils/id.ts nextCustomerId() — used when the client
// doesn't supply an id (e.g. direct API calls).
async function nextCustomerId(): Promise<string> {
  const year = new Date().getFullYear();
  const existing = await prisma.customer.findMany({
    where:  { id: { startsWith: `CUS-${year}-` } },
    select: { id: true },
  });
  const seq = existing.reduce((max, c) => {
    const n = parseInt(c.id.split('-')[2], 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0) + 1;
  return `CUS-${year}-${String(seq).padStart(4, '0')}`;
}

function sanitize(body: Record<string, unknown>) {
  // customerNumber is DB-generated only (sequence-backed) — never accept it
  // from the client on create or update.
  const { createdAt, updatedAt, customerNumber, ...rest } = body;
  return rest;
}

export default router;
