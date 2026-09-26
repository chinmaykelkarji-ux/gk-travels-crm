// Notifications — /api/v2/notifications. A person only ever sees and marks
// their own; no permission beyond being signed in.
import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import * as svc from '../../modules/notifications/service.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res) => { res.json(await svc.listFor(String(req.userId))); });
router.post('/read-all', async (req: AuthRequest, res) => { res.json(await svc.markAllRead(String(req.userId))); });
router.post('/:id/read', async (req: AuthRequest, res) => { res.json(await svc.markRead(String(req.params.id), String(req.userId))); });

export default router;
