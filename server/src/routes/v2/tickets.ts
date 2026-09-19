// Tickets v2 — /api/v2/tickets. Flight, train and bus tickets with
// segments and per-passenger rows.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import {
  TicketInput, TicketUpdate, TicketListQuery, SegmentInput, PassengerInput, PassengerRowUpdate, BulkStatusInput, TicketCancel,
} from '../../../../src/shared/contracts/tickets.js';
import * as svc from '../../modules/tickets/service.js';
import { importLegacyBookings } from '../../modules/tickets/legacyImport.js';

const router = Router();
router.use(requireAuth);
const p = (req: AuthRequest, k: string) => String(req.params[k]);
const body = <T>(res: Parameters<typeof valid>[0]) => valid<T>(res).body;
const READ = requirePermission('operations:read');
const WRITE = requirePermission('operations:write');

router.get('/', READ, validate({ query: TicketListQuery }), async (req: AuthRequest, res) => { res.json(await svc.listTickets(valid<unknown, z.infer<typeof TicketListQuery>>(res).query, req.userRole)); });
router.post('/', WRITE, validate({ body: TicketInput }), async (req: AuthRequest, res) => { res.status(201).json(await svc.createTicket(body<z.infer<typeof TicketInput>>(res), req.userRole, req.userId)); });
/** Pulls flight/train/bus/hotel/cab/activity bookings made on the classic screen since the last import. */
router.post('/import-classic', requirePermission('trips:write'), async (req: AuthRequest, res) => { res.json(await importLegacyBookings(req.userId)); });
router.get('/:id', READ, async (req: AuthRequest, res) => { res.json(await svc.getTicket(p(req, 'id'), req.userRole)); });
router.put('/:id', WRITE, validate({ body: TicketUpdate }), async (req: AuthRequest, res) => { res.json(await svc.updateTicket(p(req, 'id'), body<z.infer<typeof TicketUpdate>>(res), req.userRole, req.userId)); });
router.post('/:id/segments', WRITE, validate({ body: SegmentInput }), async (req: AuthRequest, res) => { res.status(201).json(await svc.addSegment(p(req, 'id'), body<z.infer<typeof SegmentInput>>(res), req.userRole, req.userId)); });
router.put('/segments/:segId', WRITE, validate({ body: SegmentInput }), async (req: AuthRequest, res) => { res.json(await svc.updateSegment(p(req, 'segId'), body<z.infer<typeof SegmentInput>>(res), req.userRole, req.userId)); });
router.delete('/segments/:segId', WRITE, async (req: AuthRequest, res) => { res.json(await svc.deleteSegment(p(req, 'segId'), req.userRole, req.userId)); });
router.post('/:id/passengers', WRITE, validate({ body: z.object({ passengers: z.array(PassengerInput).min(1).max(200) }) }), async (req: AuthRequest, res) => { res.status(201).json(await svc.addPassengers(p(req, 'id'), body<{ passengers: z.infer<typeof PassengerInput>[] }>(res).passengers, req.userRole, req.userId)); });
router.delete('/:id/passengers/:paxIndex', WRITE, async (req: AuthRequest, res) => { res.json(await svc.removePassenger(p(req, 'id'), Number(p(req, 'paxIndex')), req.userRole, req.userId)); });
router.put('/rows/:rowId', WRITE, validate({ body: PassengerRowUpdate }), async (req: AuthRequest, res) => { res.json(await svc.updatePassengerRow(p(req, 'rowId'), body<z.infer<typeof PassengerRowUpdate>>(res), req.userRole, req.userId)); });
router.post('/:id/statuses', WRITE, validate({ body: BulkStatusInput }), async (req: AuthRequest, res) => { res.json(await svc.bulkStatuses(p(req, 'id'), body<z.infer<typeof BulkStatusInput>>(res), req.userRole, req.userId)); });
router.post('/:id/cancel', WRITE, validate({ body: TicketCancel }), async (req: AuthRequest, res) => { res.json(await svc.cancelTicket(p(req, 'id'), body<z.infer<typeof TicketCancel>>(res), req.userRole, req.userId)); });

export default router;
