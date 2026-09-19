// Itinerary v2 — /api/v2/itineraries. Reading goes with trips:read; building
// with operations:write (the people who run the trip). /:id/customer is the
// only customer-facing shape and is what the print page and WhatsApp text use.
import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { ItineraryCreate, ItineraryListQuery, ItinerarySave } from '../../../../src/shared/contracts/itineraries.js';
import * as svc from '../../modules/itineraries/service.js';
import { syncItinerary } from '../../modules/itineraries/sync.js';

const router = Router();
router.use(requireAuth);
const p = (req: AuthRequest, k = 'id') => String(req.params[k]);

router.get('/', requirePermission('trips:read'), validate({ query: ItineraryListQuery }), async (_req, res) => { res.json(await svc.listItineraries(valid<unknown, ItineraryListQuery>(res).query)); });
router.get('/by-trip/:tripId', requirePermission('trips:read'), async (req: AuthRequest, res) => { res.json({ itinerary: await svc.getTripItinerary(p(req, 'tripId'), req.userRole) }); });
router.post('/', requirePermission('operations:write'), validate({ body: ItineraryCreate }), async (req: AuthRequest, res) => { res.status(201).json(await svc.createItinerary(valid<ItineraryCreate>(res).body, req.userRole, req.userId)); });
router.get('/:id', requirePermission('trips:read'), async (req: AuthRequest, res) => { res.json(await svc.getItinerary(p(req), req.userRole)); });
router.get('/:id/customer', requirePermission('trips:read'), async (req: AuthRequest, res) => { res.json(await svc.customerView(p(req))); });
router.put('/:id', requirePermission('operations:write'), validate({ body: ItinerarySave }), async (req: AuthRequest, res) => { res.json(await svc.saveItinerary(p(req), valid<ItinerarySave>(res).body, req.userRole, req.userId)); });
router.post('/:id/sync', requirePermission('operations:write'), async (req: AuthRequest, res) => { res.json(await syncItinerary(p(req), req.userRole, req.userId)); });
router.post('/:id/share', requirePermission('operations:write'), async (req: AuthRequest, res) => { res.json(await svc.markShared(p(req), req.userRole, req.userId)); });
router.delete('/:id', requirePermission('operations:write'), async (req: AuthRequest, res) => { res.json(await svc.deleteItinerary(p(req), req.userId)); });

export default router;
