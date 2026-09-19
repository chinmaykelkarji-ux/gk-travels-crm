// Trip operational records — /api/v2/ops. Hotel bookings, vehicle
// assignments (with conflict checks) and activity bookings.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import {
  HotelBookingInput, HotelBookingUpdate, VehicleAssignmentInput, VehicleAssignmentUpdate, ActivityBookingInput, ActivityBookingUpdate,
  OpsStatusChange, AssignmentStatusChange, ConflictQuery,
} from '../../../../src/shared/contracts/operations.js';
import { parseIst } from '../../../../src/shared/calc/istTime.js';
import * as hotels from '../../modules/operations/hotelBookings.service.js';
import * as vehicles from '../../modules/operations/vehicleAssignments.service.js';
import * as activities from '../../modules/operations/activityBookings.service.js';

const router = Router();
router.use(requireAuth);
const p = (req: AuthRequest, k: string) => String(req.params[k]);
const body = <T>(res: Parameters<typeof valid>[0]) => valid<T>(res).body;
const READ = requirePermission('operations:read');
const WRITE = requirePermission('operations:write');

// Hotels
router.get('/trips/:tripId/hotel-bookings', READ, async (req: AuthRequest, res) => { res.json(await hotels.listHotelBookings(p(req, 'tripId'), req.userRole)); });
router.post('/trips/:tripId/hotel-bookings', WRITE, validate({ body: HotelBookingInput }), async (req: AuthRequest, res) => { res.status(201).json(await hotels.createHotelBooking(p(req, 'tripId'), body<z.infer<typeof HotelBookingInput>>(res), req.userRole, req.userId)); });
router.put('/hotel-bookings/:id', WRITE, validate({ body: HotelBookingUpdate }), async (req: AuthRequest, res) => { res.json(await hotels.updateHotelBooking(p(req, 'id'), body<z.infer<typeof HotelBookingUpdate>>(res), req.userRole, req.userId)); });
router.post('/hotel-bookings/:id/status', WRITE, validate({ body: OpsStatusChange }), async (req: AuthRequest, res) => { res.json(await hotels.setHotelBookingStatus(p(req, 'id'), body<z.infer<typeof OpsStatusChange>>(res), req.userRole, req.userId)); });

// Vehicles
router.get('/vehicle-assignments/conflicts', READ, validate({ query: ConflictQuery }), async (_req, res) => { res.json(await vehicles.checkConflicts(valid<unknown, z.infer<typeof ConflictQuery>>(res).query)); });
router.get('/schedule', READ, async (req: AuthRequest, res) => {
  const from = parseIst(String(req.query.from ?? '')) ?? new Date();
  const to = parseIst(String(req.query.to ?? '')) ?? new Date(from.getTime() + 7 * 86_400_000);
  res.json(await vehicles.schedule(from.toISOString(), to.toISOString(), req.userRole));
});
router.get('/trips/:tripId/vehicle-assignments', READ, async (req: AuthRequest, res) => { res.json(await vehicles.listAssignments(p(req, 'tripId'), req.userRole)); });
router.post('/trips/:tripId/vehicle-assignments', WRITE, validate({ body: VehicleAssignmentInput }), async (req: AuthRequest, res) => { res.status(201).json(await vehicles.createAssignment(p(req, 'tripId'), body<z.infer<typeof VehicleAssignmentInput>>(res), req.userRole, req.userId)); });
router.put('/vehicle-assignments/:id', WRITE, validate({ body: VehicleAssignmentUpdate }), async (req: AuthRequest, res) => { res.json(await vehicles.updateAssignment(p(req, 'id'), body<z.infer<typeof VehicleAssignmentUpdate>>(res), req.userRole, req.userId)); });
router.post('/vehicle-assignments/:id/status', WRITE, validate({ body: AssignmentStatusChange }), async (req: AuthRequest, res) => { res.json(await vehicles.setAssignmentStatus(p(req, 'id'), body<z.infer<typeof AssignmentStatusChange>>(res), req.userRole, req.userId)); });

// Activities
router.get('/trips/:tripId/activity-bookings', READ, async (req: AuthRequest, res) => { res.json(await activities.listActivityBookings(p(req, 'tripId'), req.userRole)); });
router.post('/trips/:tripId/activity-bookings', WRITE, validate({ body: ActivityBookingInput }), async (req: AuthRequest, res) => { res.status(201).json(await activities.createActivityBooking(p(req, 'tripId'), body<z.infer<typeof ActivityBookingInput>>(res), req.userRole, req.userId)); });
router.put('/activity-bookings/:id', WRITE, validate({ body: ActivityBookingUpdate }), async (req: AuthRequest, res) => { res.json(await activities.updateActivityBooking(p(req, 'id'), body<z.infer<typeof ActivityBookingUpdate>>(res), req.userRole, req.userId)); });
router.post('/activity-bookings/:id/status', WRITE, validate({ body: OpsStatusChange }), async (req: AuthRequest, res) => { res.json(await activities.setActivityBookingStatus(p(req, 'id'), body<z.infer<typeof OpsStatusChange>>(res), req.userRole, req.userId)); });

export default router;
