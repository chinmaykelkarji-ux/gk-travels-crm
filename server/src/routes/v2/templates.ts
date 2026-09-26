// Message templates — /api/v2/templates. Anyone who sends messages may read
// them; only the owner (settings:write) changes what the business says.
import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { TemplateCreate, TemplateUpdate } from '../../../../src/shared/contracts/templates.js';
import * as svc from '../../modules/templates/service.js';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('messaging:read'), async (_req, res) => { res.json({ items: await svc.listTemplates() }); });
router.post('/', requirePermission('settings:write'), validate({ body: TemplateCreate }), async (req: AuthRequest, res) => {
  res.status(201).json(await svc.createTemplate(valid<TemplateCreate>(res).body, req.userId));
});
router.patch('/:id', requirePermission('settings:write'), validate({ body: TemplateUpdate }), async (req: AuthRequest, res) => {
  res.json(await svc.updateTemplate(String(req.params.id), valid<TemplateUpdate>(res).body, req.userId));
});
router.post('/:id/reset', requirePermission('settings:write'), async (req: AuthRequest, res) => {
  res.json(await svc.resetTemplate(String(req.params.id), req.userId));
});
router.delete('/:id', requirePermission('settings:write'), async (req: AuthRequest, res) => {
  await svc.deleteTemplate(String(req.params.id), req.userId);
  res.status(204).end();
});

export default router;
