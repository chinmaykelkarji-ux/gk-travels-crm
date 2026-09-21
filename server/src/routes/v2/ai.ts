// AI status — /api/v2/ai. Says honestly what is configured on this server and
// what is not, so every screen can show "Not configured" instead of a button
// that would fail. No key, or any part of one, is ever returned.
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { aiStatus } from '../../ai/index.js';

const router = Router();
router.use(requireAuth);

router.get('/status', requirePermission('documents:read'), (_req, res) => { res.json(aiStatus()); });

export default router;
