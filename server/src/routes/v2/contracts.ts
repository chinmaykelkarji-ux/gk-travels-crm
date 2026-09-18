// Booking contracts — /api/v2/contracts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { ContractListQuery, ScheduleInput, ContractStatusChange, ContractNotes } from '../../../../src/shared/contracts/contracts.js';
import * as svc from '../../modules/contracts/service.js';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('bookings:read'), validate({ query: ContractListQuery }), async (_req, res) => {
  res.json(await svc.listContracts(valid<unknown, z.infer<typeof ContractListQuery>>(res).query));
});
router.get('/payments-due', requirePermission('bookings:read'), async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days ?? 7) || 7));
  res.json(await svc.paymentsDue(days));
});
router.get('/:id', requirePermission('bookings:read'), async (req, res) => {
  res.json(await svc.getContract(String(req.params.id)));
});
router.put('/:id/schedule', requirePermission('bookings:write'), validate({ body: ScheduleInput }), async (req: AuthRequest, res) => {
  res.json(await svc.setSchedule(String(req.params.id), valid<z.infer<typeof ScheduleInput>>(res).body, req.userId));
});
router.post('/:id/status', requirePermission('bookings:write'), validate({ body: ContractStatusChange }), async (req: AuthRequest, res) => {
  const b = valid<z.infer<typeof ContractStatusChange>>(res).body;
  res.json(await svc.setContractStatus(String(req.params.id), b.status, b.reason, req.userId));
});
router.put('/:id/notes', requirePermission('bookings:write'), validate({ body: ContractNotes }), async (req: AuthRequest, res) => {
  res.json(await svc.setContractNotes(String(req.params.id), valid<z.infer<typeof ContractNotes>>(res).body.notes, req.userId));
});

export default router;
