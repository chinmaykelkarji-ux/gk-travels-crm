// Travellers v2 + trip membership. Passport/visa data: same access as customers.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { TravellerCreate, TravellerUpdate, TravellerListQuery, TripTravellersPut, PassportAlertsQuery, RevealInput } from '../../../../src/shared/contracts/travellers.js';
import { revealTravellerId } from '../../core/identity.js';
import * as svc from '../../modules/travellers/service.js';

export const travellersRouter = Router();
travellersRouter.use(requireAuth);

travellersRouter.get('/', requirePermission('customers:read'), validate({ query: TravellerListQuery }), async (_req, res) => {
  res.json(await svc.listTravellers(valid<unknown, z.infer<typeof TravellerListQuery>>(res).query));
});

travellersRouter.get('/passport-alerts', requirePermission('customers:read'), validate({ query: PassportAlertsQuery }), async (_req, res) => {
  res.json(await svc.passportAlerts(valid<unknown, z.infer<typeof PassportAlertsQuery>>(res).query.days));
});

travellersRouter.post('/', requirePermission('customers:write'), validate({ body: TravellerCreate }), async (req: AuthRequest, res) => {
  res.status(201).json(await svc.createTraveller(valid<z.infer<typeof TravellerCreate>>(res).body, req.userId));
});

travellersRouter.get('/:id', requirePermission('customers:read'), async (req, res) => {
  res.json(await svc.getTraveller(String(req.params.id)));
});

travellersRouter.put('/:id', requirePermission('customers:write'), validate({ body: TravellerUpdate }), async (req: AuthRequest, res) => {
  res.json(await svc.updateTraveller(String(req.params.id), valid<z.infer<typeof TravellerUpdate>>(res).body, req.userId));
});

// Full identity number, for filling an airline or visa form. Every call is audited.
travellersRouter.post('/:id/reveal', requirePermission('customers:read'), validate({ body: RevealInput }), async (req: AuthRequest, res) => {
  const b = valid<z.infer<typeof RevealInput>>(res).body;
  res.setHeader('Cache-Control', 'no-store');
  res.json(await revealTravellerId(String(req.params.id), b.field, req.userId, b.reason));
});

travellersRouter.delete('/:id', requirePermission('customers:write'), async (req: AuthRequest, res) => {
  await svc.softDeleteTraveller(String(req.params.id), req.userId);
  res.json({ ok: true });
});

// Mounted at /api/v2/trips/:tripId/travellers
export const tripTravellersRouter = Router({ mergeParams: true });
tripTravellersRouter.use(requireAuth);

tripTravellersRouter.get('/', requirePermission('trips:read'), async (req, res) => {
  res.json(await svc.getTripTravellers(String(req.params.tripId)));
});

tripTravellersRouter.put('/', requirePermission('trips:write'), validate({ body: TripTravellersPut }), async (req: AuthRequest, res) => {
  res.json(await svc.setTripTravellers(String(req.params.tripId), valid<z.infer<typeof TripTravellersPut>>(res).body, req.userId));
});
