// ============================================================
// The organisation — /api/v2/organization.
//
//   GET   /         name and settings (every staff member reads them)
//   PATCH /         change them (settings:write)
//   GET   /setup    what is and is not set up yet (settings:write)
// ============================================================

import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { OrgSettingsPatch } from '../../../../src/shared/contracts/organization.js';
import * as svc from '../../modules/organization/service.js';

const router = Router();
router.use(requireAuth);
router.get('/', requirePermission('insights:read'), async (_req, res) => { res.json(await svc.getOrganization()); });
router.patch('/', requirePermission('settings:write'), validate({ body: OrgSettingsPatch }), async (req: AuthRequest, res) => {
  res.json(await svc.updateSettings(valid<OrgSettingsPatch>(res).body, req.userId));
});
router.get('/setup', requirePermission('settings:write'), async (_req, res) => { res.json(await svc.setupChecklist()); });

export default router;
