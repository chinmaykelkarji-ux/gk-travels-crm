// Trip control centre — /api/v2/trips (membership lives at
// /api/v2/trips/:tripId/travellers, routes/v2/travellers.ts).
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { TripListQuery, TripCreate, TripUpdate, StageChange, PickupPointsPut, TravellerAssignments } from '../../../../src/shared/contracts/trips.js';
import * as svc from '../../modules/trips/service.js';
import { changeStage, readiness } from '../../modules/trips/stage.js';
import { prisma } from '../../lib/prisma.js';

const router = Router();
router.use(requireAuth);
const p = (req: AuthRequest, k = 'id') => String(req.params[k]);
const body = <T>(res: Parameters<typeof valid>[0]) => valid<T>(res).body;

router.get('/', requirePermission('trips:read'), validate({ query: TripListQuery }), async (_req, res) => { res.json(await svc.listTrips(valid<unknown, z.infer<typeof TripListQuery>>(res).query)); });
router.post('/', requirePermission('trips:write'), validate({ body: TripCreate }), async (req: AuthRequest, res) => { res.status(201).json(await svc.createTrip(body<z.infer<typeof TripCreate>>(res), req.userId)); });
router.get('/:id', requirePermission('trips:read'), async (req: AuthRequest, res) => { res.json(await svc.getWorkspace(p(req), req.userRole)); });
router.get('/:id/readiness', requirePermission('trips:read'), async (req: AuthRequest, res) => { res.json(await readiness(prisma, p(req))); });
router.put('/:id', requirePermission('operations:write'), validate({ body: TripUpdate }), async (req: AuthRequest, res) => { res.json(await svc.updateTrip(p(req), body<z.infer<typeof TripUpdate>>(res), req.userRole, req.userId)); });
router.post('/:id/stage', requirePermission('operations:write'), validate({ body: StageChange }), async (req: AuthRequest, res) => {
  const b = body<z.infer<typeof StageChange>>(res);
  await changeStage(p(req), b.stage, b.reason, req.userId);
  res.json(await svc.getWorkspace(p(req), req.userRole));
});
router.put('/:id/pickup-points', requirePermission('operations:write'), validate({ body: PickupPointsPut }), async (req: AuthRequest, res) => { res.json(await svc.setPickupPoints(p(req), body<z.infer<typeof PickupPointsPut>>(res), req.userRole, req.userId)); });
router.put('/:id/assignments', requirePermission('operations:write'), validate({ body: TravellerAssignments }), async (req: AuthRequest, res) => { res.json(await svc.assignTravellers(p(req), body<z.infer<typeof TravellerAssignments>>(res), req.userRole, req.userId)); });

export default router;
