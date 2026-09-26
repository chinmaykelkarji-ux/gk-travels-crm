// ============================================================
// Communications — /api/v2/communications.
//
//   GET /api/v2/communications/status   which channels can really send
//
// Sending and the per-record log arrive in 7.2.
// ============================================================

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { channelStatus } from '../../comms/index.js';

const router = Router();
router.use(requireAuth);

router.get('/status', requirePermission('insights:read'), (_req, res) => { res.json(channelStatus()); });

export default router;
