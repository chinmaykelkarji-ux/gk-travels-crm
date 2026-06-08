import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';

const router = Router();
router.use(requireAuth);

// GET /api/activity?limit=100
router.get('/', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const logs  = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take:    limit,
    });
    res.json(logs);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// POST /api/activity
router.post('/', async (req, res) => {
  try {
    const log = await prisma.activityLog.create({ data: req.body });
    res.status(201).json(log);
  } catch (err) {
    console.error('[activity POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Reminders ──────────────────────────────────────────────────

// GET /api/activity/reminders
router.get('/reminders', async (_req, res) => {
  try { res.json(await prisma.reminder.findMany({ orderBy: { createdAt: 'desc' } })); }
  catch (err) { res.status(500).json({ error: String(err) }); }
});

// POST /api/activity/reminders/bulk  — replace all reminders
router.post('/reminders/bulk', async (req, res) => {
  try {
    const reminders = req.body as Array<Record<string, unknown>>;
    await prisma.reminder.deleteMany({});
    if (reminders.length) {
      await prisma.reminder.createMany({
        data:            reminders.map(({ id, ...r }) => r as Prisma.ReminderCreateManyInput),
        skipDuplicates: true,
      });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[reminders bulk]', err);
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/activity/reminders/:id/sent
router.put('/reminders/:id/sent', async (req: AuthRequest, res) => {
  try {
    const r = await prisma.reminder.update({
      where: { id: req.params.id },
      data:  { sent: true, sentAt: new Date().toISOString() },
    });

    await logActivity(prisma, {
      action:      'reminder_completed',
      description: `Reminder completed: "${r.message}"`,
      entityType:  r.tripId ? 'trip' : 'reminder',
      entityId:    r.tripId ?? r.id,
      userId:      req.userId,
      metadata:    { type: r.type, priority: r.priority, reminderId: r.id, dueDate: r.dueDate },
      after:       { sent: true, sentAt: r.sentAt },
    });

    res.json(r);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;
