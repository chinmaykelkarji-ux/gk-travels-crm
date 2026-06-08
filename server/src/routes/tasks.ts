import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { logActivity } from '../services/activityService.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try { res.json(await prisma.task.findMany({ orderBy: { createdAt: 'desc' } })); }
  catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post('/', async (req, res) => {
  try {
    const t = await prisma.task.upsert({
      where:  { id: req.body.id },
      update: sanitize(req.body) as Parameters<typeof prisma.task.update>[0]['data'],
      create: sanitize(req.body) as Parameters<typeof prisma.task.create>[0]['data'],
    });
    res.status(201).json(t);
  } catch (err) {
    console.error('[tasks POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const before = await prisma.task.findUnique({ where: { id: req.params.id }, select: { status: true } });
    const t = await prisma.task.update({
      where: { id: req.params.id },
      data:  sanitize(req.body) as Parameters<typeof prisma.task.update>[0]['data'],
    });

    if (before && before.status !== 'completed' && t.status === 'completed') {
      await logActivity(prisma, {
        type:       'task_completed',
        message:    `Task "${t.title}" marked completed`,
        entityType: 'task',
        entityId:   t.id,
        userId:     req.userId,
        before,
        after:      { status: t.status },
      });
    }

    res.json(t);
  } catch (err) {
    console.error('[tasks PUT]', req.params.id, err);
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[tasks DELETE]', req.params.id, err);
    res.status(500).json({ error: String(err) });
  }
});

function sanitize(body: Record<string, unknown>) {
  const { createdAt, updatedAt, trip, ...rest } = body;
  return rest;
}

export default router;
