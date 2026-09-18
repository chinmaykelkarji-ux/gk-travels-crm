// ============================================================
// Job endpoints.
//
//   POST|GET /api/jobs/tick   — run one tick. Protected by CRON_SECRET
//                               (Authorization: Bearer <secret>, the header
//                               Vercel Cron sends). 503 when unset: the
//                               endpoint is never open.
//   GET      /api/jobs        — recent jobs of the caller's organisation (admin)
// ============================================================

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual, createHash } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { runTick, registeredJobTypes } from '../core/jobs.js';
import { AppError, notConfigured } from '../core/errors.js';
import '../jobs/handlers.js';

const router = Router();

function requireCronSecret(req: Request, _res: Response, next: NextFunction): void {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return next(notConfigured('Job scheduling (CRON_SECRET)'));
  const header = req.header('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : (req.header('x-cron-secret') ?? '');
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(secret).digest();
  if (!presented || !timingSafeEqual(a, b)) return next(new AppError('UNAUTHENTICATED', 401, 'Invalid scheduler credentials'));
  next();
}

async function tick(req: Request, res: Response): Promise<void> {
  const budgetMs = Number(process.env.JOB_TICK_BUDGET_MS) || undefined;
  const summary  = await runTick({ budgetMs, workerId: `cron-${req.ip ?? 'unknown'}-${Date.now().toString(36)}` });
  res.json({ ok: true, ...summary, handlers: registeredJobTypes() });
}

router.post('/tick', requireCronSecret, tick);
router.get('/tick',  requireCronSecret, tick);

router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const jobs = await prisma.job.findMany({
    where:   status ? { status: status as never } : undefined,
    orderBy: { createdAt: 'desc' },
    take:    100,
  });
  res.json(jobs);
});

export default router;
