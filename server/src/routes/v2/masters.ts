// Operations masters — /api/v2/vendors, /hotels, /vehicles, /drivers,
// /activities and /masters (compliance board, CSV import). Routes parse,
// authorise and delegate; services own rules, redaction and audit.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission, hasPermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import { forbidden } from '../../core/errors.js';
import type { Role } from '@prisma/client';
import {
  MasterListQuery, ActiveToggle, VendorInput, VendorUpdate, HotelInput, HotelUpdate, RoomTypeInput, RoomTypeUpdate, RateInput, StayQuoteQuery,
  VehicleInput, VehicleUpdate, DriverInput, DriverUpdate, ActivityInput, ActivityUpdate, CsvImport, ImportKindSchema,
} from '../../../../src/shared/contracts/masters.js';
import type { ImportKind } from '../../../../src/shared/calc/importMapping.js';
import * as vendors from '../../modules/masters/vendors.service.js';
import * as hotels from '../../modules/masters/hotels.service.js';
import * as fleet from '../../modules/masters/fleet.service.js';
import * as activities from '../../modules/masters/activities.service.js';
import * as importer from '../../modules/masters/import.service.js';

type Q = z.infer<typeof MasterListQuery>;
const id = (req: AuthRequest, name = 'id') => String(req.params[name]);
const body = <T>(res: Parameters<typeof valid>[0]) => valid<T>(res).body;
const query = (res: Parameters<typeof valid>[0]) => valid<unknown, Q>(res).query;

// ── Vendors ───────────────────────────────────────────────────
export const vendorsRouter = Router();
vendorsRouter.use(requireAuth);
vendorsRouter.get('/', requirePermission('suppliers:read'), validate({ query: MasterListQuery }), async (req: AuthRequest, res) => { res.json(await vendors.listVendors(query(res), req.userRole)); });
vendorsRouter.post('/', requirePermission('suppliers:write'), validate({ body: VendorInput }), async (req: AuthRequest, res) => { res.status(201).json(await vendors.createVendor(body<z.infer<typeof VendorInput>>(res), req.userRole, req.userId)); });
vendorsRouter.get('/:id', requirePermission('suppliers:read'), async (req: AuthRequest, res) => { res.json(await vendors.getVendor(id(req), req.userRole)); });
vendorsRouter.put('/:id', requirePermission('suppliers:write'), validate({ body: VendorUpdate }), async (req: AuthRequest, res) => { res.json(await vendors.updateVendor(id(req), body<z.infer<typeof VendorUpdate>>(res), req.userRole, req.userId)); });
vendorsRouter.post('/:id/active', requirePermission('suppliers:write'), validate({ body: ActiveToggle }), async (req: AuthRequest, res) => { res.json(await vendors.setVendorActive(id(req), body<{ isActive: boolean }>(res).isActive, req.userRole, req.userId)); });

// ── Hotels ────────────────────────────────────────────────────
export const hotelsRouter = Router();
hotelsRouter.use(requireAuth);
hotelsRouter.get('/', requirePermission('masters:read'), validate({ query: MasterListQuery }), async (_req, res) => { res.json(await hotels.listHotels(query(res))); });
hotelsRouter.post('/', requirePermission('masters:write'), validate({ body: HotelInput }), async (req: AuthRequest, res) => { res.status(201).json(await hotels.createHotel(body<z.infer<typeof HotelInput>>(res), req.userRole, req.userId)); });
hotelsRouter.get('/:id', requirePermission('masters:read'), async (req: AuthRequest, res) => { res.json(await hotels.getHotel(id(req), req.userRole)); });
hotelsRouter.put('/:id', requirePermission('masters:write'), validate({ body: HotelUpdate }), async (req: AuthRequest, res) => { res.json(await hotels.updateHotel(id(req), body<z.infer<typeof HotelUpdate>>(res), req.userRole, req.userId)); });
hotelsRouter.post('/:id/room-types', requirePermission('masters:write'), validate({ body: RoomTypeInput }), async (req: AuthRequest, res) => { res.status(201).json(await hotels.addRoomType(id(req), body<z.infer<typeof RoomTypeInput>>(res), req.userRole, req.userId)); });
hotelsRouter.put('/room-types/:rtId', requirePermission('masters:write'), validate({ body: RoomTypeUpdate }), async (req: AuthRequest, res) => { res.json(await hotels.updateRoomType(id(req, 'rtId'), body<z.infer<typeof RoomTypeUpdate>>(res), req.userRole, req.userId)); });
hotelsRouter.post('/room-types/:rtId/rates', requirePermission('rates:write'), validate({ body: RateInput }), async (req: AuthRequest, res) => { res.status(201).json(await hotels.addRate(id(req, 'rtId'), body<z.infer<typeof RateInput>>(res), req.userRole, req.userId)); });
hotelsRouter.put('/rates/:rateId', requirePermission('rates:write'), validate({ body: RateInput }), async (req: AuthRequest, res) => { res.json(await hotels.updateRate(id(req, 'rateId'), body<z.infer<typeof RateInput>>(res), req.userRole, req.userId)); });
hotelsRouter.delete('/rates/:rateId', requirePermission('rates:write'), async (req: AuthRequest, res) => { res.json(await hotels.deleteRate(id(req, 'rateId'), req.userRole, req.userId)); });
hotelsRouter.get('/:id/quote', requirePermission('rates:write'), validate({ query: StayQuoteQuery }), async (req: AuthRequest, res) => { res.json(await hotels.quoteHotelStay(id(req), valid<unknown, z.infer<typeof StayQuoteQuery>>(res).query)); });

// ── Vehicles + drivers ────────────────────────────────────────
export const vehiclesRouter = Router();
vehiclesRouter.use(requireAuth);
vehiclesRouter.get('/', requirePermission('masters:read'), validate({ query: MasterListQuery }), async (_req, res) => { res.json(await fleet.listVehicles(query(res))); });
vehiclesRouter.post('/', requirePermission('masters:write'), validate({ body: VehicleInput }), async (req: AuthRequest, res) => { res.status(201).json(await fleet.createVehicle(body<z.infer<typeof VehicleInput>>(res), req.userId)); });
vehiclesRouter.get('/:id', requirePermission('masters:read'), async (req: AuthRequest, res) => { res.json(await fleet.getVehicle(id(req))); });
vehiclesRouter.put('/:id', requirePermission('masters:write'), validate({ body: VehicleUpdate }), async (req: AuthRequest, res) => { res.json(await fleet.updateVehicle(id(req), body<z.infer<typeof VehicleUpdate>>(res), req.userId)); });

export const driversRouter = Router();
driversRouter.use(requireAuth);
driversRouter.get('/', requirePermission('masters:read'), validate({ query: MasterListQuery }), async (_req, res) => { res.json(await fleet.listDrivers(query(res))); });
driversRouter.post('/', requirePermission('masters:write'), validate({ body: DriverInput }), async (req: AuthRequest, res) => { res.status(201).json(await fleet.createDriver(body<z.infer<typeof DriverInput>>(res), req.userId)); });
driversRouter.get('/:id', requirePermission('masters:read'), async (req: AuthRequest, res) => { res.json(await fleet.getDriver(id(req))); });
driversRouter.put('/:id', requirePermission('masters:write'), validate({ body: DriverUpdate }), async (req: AuthRequest, res) => { res.json(await fleet.updateDriver(id(req), body<z.infer<typeof DriverUpdate>>(res), req.userId)); });

// ── Activities ────────────────────────────────────────────────
export const activitiesRouter = Router();
activitiesRouter.use(requireAuth);
activitiesRouter.get('/', requirePermission('masters:read'), validate({ query: MasterListQuery }), async (req: AuthRequest, res) => { res.json(await activities.listActivities(query(res), req.userRole)); });
activitiesRouter.post('/', requirePermission('masters:write'), validate({ body: ActivityInput }), async (req: AuthRequest, res) => { res.status(201).json(await activities.createActivity(body<z.infer<typeof ActivityInput>>(res), req.userRole, req.userId)); });
activitiesRouter.get('/:id', requirePermission('masters:read'), async (req: AuthRequest, res) => { res.json(await activities.getActivity(id(req), req.userRole)); });
activitiesRouter.put('/:id', requirePermission('masters:write'), validate({ body: ActivityUpdate }), async (req: AuthRequest, res) => { res.json(await activities.updateActivity(id(req), body<z.infer<typeof ActivityUpdate>>(res), req.userRole, req.userId)); });

// ── Compliance board + import ─────────────────────────────────
export const mastersRouter = Router();
mastersRouter.use(requireAuth);
mastersRouter.get('/compliance', requirePermission('masters:read'), async (_req, res) => { res.json(await fleet.complianceBoard()); });

/** Vendors are written with suppliers:write, everything else with masters:write (rates additionally need rates:write in the service). */
function assertImportAllowed(req: AuthRequest, kind: ImportKind) {
  const role = req.userRole as Role;
  const perm = kind === 'vendors' ? 'suppliers:write' : kind === 'hotel-rates' ? 'rates:write' : 'masters:write';
  if (!hasPermission(role, perm)) throw forbidden(`Importing ${kind} needs ${perm}`);
}
const KindParam = z.object({ kind: ImportKindSchema });
mastersRouter.post('/import/:kind/preview', validate({ params: KindParam, body: CsvImport }), async (req: AuthRequest, res) => {
  const kind = valid<unknown, unknown, { kind: ImportKind }>(res).params.kind;
  assertImportAllowed(req, kind);
  res.json(await importer.previewImport(kind, body<z.infer<typeof CsvImport>>(res).csv, req.userRole));
});
mastersRouter.post('/import/:kind/commit', validate({ params: KindParam, body: CsvImport }), async (req: AuthRequest, res) => {
  const kind = valid<unknown, unknown, { kind: ImportKind }>(res).params.kind;
  assertImportAllowed(req, kind);
  const b = body<z.infer<typeof CsvImport>>(res);
  res.json(await importer.commitImport(kind, b.csv, b.skipInvalid, req.userRole, req.userId));
});
