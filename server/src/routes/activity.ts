import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';
import { logActivity } from '../lib/activity.js';
import { redactActivity } from '../lib/redact.js';

const router = Router();
router.use(requireAuth);

// GET /api/activity?limit=100
//
// Financial before/after snapshots are stripped for roles without
// finance:read (see lib/redact.ts).
router.get('/', async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const logs  = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take:    limit,
    });
    res.json(logs.map(l => redactActivity(l, req.userRole)));
  } catch (err) {
    console.error('[activity GET]', err);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

// NOTE: the former `POST /api/activity` (create an arbitrary activity row from
// the request body) and `POST /api/activity/reminders/bulk` (delete every
// reminder, then recreate from the body) were removed. Neither was called by
// the client, and both let any signed-in user forge the audit trail or wipe
// reminders. Activity rows are written only by server services through
// lib/activity.ts.

// ── Reminders ──────────────────────────────────────────────────

// GET /api/activity/reminders
router.get('/reminders', async (_req, res) => {
  try { res.json(await prisma.reminder.findMany({ orderBy: { createdAt: 'desc' } })); }
  catch (err) {
    console.error('[reminders GET]', err);
    res.status(500).json({ error: 'Failed to load reminders' });
  }
});

// PUT /api/activity/reminders/:id/sent
router.put('/reminders/:id/sent', requirePermission('tasks:write'), async (req: AuthRequest, res) => {
  try {
    const r = await prisma.reminder.update({
      where: { id: String(req.params.id) },
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
  } catch (err) {
    console.error('[reminders sent]', err);
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

export default router;
