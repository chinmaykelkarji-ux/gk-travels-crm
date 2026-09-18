import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';
import { logActivity } from '../lib/activity.js';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('tasks:read'), async (_req, res) => {
  try { res.json(await prisma.task.findMany({ orderBy: { createdAt: 'desc' } })); }
  catch (err) {
    console.error('[tasks GET]', err);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

router.post('/', requirePermission('tasks:write'), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (typeof body.id !== 'string' || !body.id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const t = await prisma.task.upsert({
      where:  { id: body.id },
      update: sanitize(body) as Parameters<typeof prisma.task.update>[0]['data'],
      create: sanitize(body) as Parameters<typeof prisma.task.create>[0]['data'],
    });
    res.status(201).json(t);
  } catch (err) {
    console.error('[tasks POST]', err);
    res.status(500).json({ error: 'Failed to save task' });
  }
});

router.put('/:id', requirePermission('tasks:write'), async (req: AuthRequest, res) => {
  try {
    const id     = String(req.params.id);
    const before = await prisma.task.findUnique({ where: { id }, select: { status: true } });
    const t = await prisma.task.update({
      where: { id },
      data:  sanitize(req.body as Record<string, unknown>) as Parameters<typeof prisma.task.update>[0]['data'],
    });

    if (before && before.status !== 'completed' && t.status === 'completed') {
      await logActivity(prisma, {
        action:      'task_completed',
        description: `Task "${t.title}" marked completed`,
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
    res.status(500).json({ error: 'Failed to update task' });
  }
});

router.delete('/:id', requirePermission('tasks:write'), async (req, res) => {
  try {
    await prisma.task.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[tasks DELETE]', req.params.id, err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

function sanitize(body: Record<string, unknown>) {
  const { createdAt, updatedAt, trip, ...rest } = body;
  return rest;
}

export default router;
