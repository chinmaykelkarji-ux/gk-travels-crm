// Driver view — /api/v2/driver. The only API a DRIVER login can reach
// besides /api/v2/me and sign-out (fenced in middleware/auth.ts).
import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { DriverDutiesQuery, DriverStatusChange } from '../../../../src/shared/contracts/driver.js';
import { myDuties, updateMyDuty } from '../../modules/driver/service.js';

const router = Router();
router.use(requireAuth);

router.get('/duties', requirePermission('driver:duties'), validate({ query: DriverDutiesQuery }), async (req: AuthRequest, res) => { res.json(await myDuties(req.userId, valid<unknown, DriverDutiesQuery>(res).query)); });
router.post('/duties/:id/status', requirePermission('driver:duties'), validate({ body: DriverStatusChange }), async (req: AuthRequest, res) => { res.json(await updateMyDuty(req.userId, String(req.params.id), valid<DriverStatusChange>(res).body)); });

export default router;
