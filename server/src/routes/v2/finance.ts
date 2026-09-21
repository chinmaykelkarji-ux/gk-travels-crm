// Finance read models — /api/v2/finance. What customers owe (aged) needs
// finance:read; a trip's profit needs commercial access, which trips:write
// roles (BOOKING) already have alongside ACCOUNTS.
import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requireAnyPermission, requirePermission } from '../../lib/permissions.js';
import * as svc from '../../modules/finance/service.js';

const router = Router();
router.use(requireAuth);

router.get('/receivables', requirePermission('finance:read'), async (_req, res) => { res.json(await svc.receivables()); });
router.get('/trips/:id/profit', requireAnyPermission('finance:read', 'trips:write'), async (req: AuthRequest, res) => {
  res.json(await svc.profitForTrip(String(req.params.id)));
});

export default router;
