// ============================================================
// Insights — /api/v2/insights.
//
//   GET  /api/v2/insights          what needs attention, counted by queries
//   POST /api/v2/insights/phrase   the same, as a short note (needs a model)
//
// Each insight is only counted for a role that could open its screen
// (modules/insights/service.ts).
// ============================================================

import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import * as svc from '../../modules/insights/service.js';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('insights:read'), async (req: AuthRequest, res) => {
  res.json(await svc.insightsFor(String(req.userRole)));
});

router.post('/phrase', requirePermission('insights:read'), async (req: AuthRequest, res) => {
  res.json(await svc.phrase(String(req.userRole)));
});

export default router;
