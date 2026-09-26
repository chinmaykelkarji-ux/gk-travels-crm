// ============================================================
// Automation rules — /api/v2/automations.
//
//   GET   /               the rules, on or off, with last 30 days of runs
//   PATCH /:key           switch on/off, change its numbers or channel
//   GET   /:key/runs      what it did, event by event
//   POST  /run            check now instead of waiting for the next tick
//
// Every staff member may see what runs automatically; only the owner
// (settings:write) changes it.
// ============================================================

import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { AutomationUpdate } from '../../../../src/shared/contracts/automation.js';
import * as svc from '../../modules/automation/service.js';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('insights:read'), async (_req, res) => { res.json({ items: await svc.listRules() }); });
router.post('/run', requirePermission('settings:write'), async (_req, res) => { res.json(await svc.sweep()); });
router.get('/:key/runs', requirePermission('insights:read'), async (req, res) => { res.json({ items: await svc.runsFor(String(req.params.key)) }); });
router.patch('/:key', requirePermission('settings:write'), validate({ body: AutomationUpdate }), async (req: AuthRequest, res) => {
  res.json(await svc.updateRule(String(req.params.key), valid<AutomationUpdate>(res).body, req.userId));
});

export default router;
