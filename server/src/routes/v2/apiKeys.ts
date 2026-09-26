// API keys — /api/v2/api-keys. Only the owner (users:write) makes or revokes them.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import * as svc from '../../modules/apiKeys/service.js';

const KeyInput = z.object({
  name: z.string().trim().min(2).max(80),
  permissions: z.array(z.string().trim().max(60)).min(1).max(60),
  days: z.number().int().min(1).max(730).nullable().default(365),
});
type KeyInput = z.infer<typeof KeyInput>;

const router = Router();
router.use(requireAuth);
router.use(requirePermission('users:write'));
router.get('/', async (_req, res) => { res.json(await svc.listKeys()); });
router.post('/', validate({ body: KeyInput }), async (req: AuthRequest, res) => { res.status(201).json(await svc.createKey(valid<KeyInput>(res).body, req.userId)); });
router.post('/:id/revoke', async (req: AuthRequest, res) => { res.json(await svc.revokeKey(String(req.params.id), req.userId)); });

export default router;
