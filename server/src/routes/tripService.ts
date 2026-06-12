import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import { startOfDay, endOfDay, addDays, addHours } from 'date-fns';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { requirePermission, hasPermission } from '../lib/permissions.js';
import type { Role as UserRole, Trip, Vendor, TripService } from '@prisma/client';

const router = Router();
router.use(requireAuth);

// PUT /:id is shared by BOOKING ('trip-services:write') and OPERATIONS
// ('trip-services:status' — status/notes/time updates only).
function requireTripServiceUpdate(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.userRole) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const role = req.userRole as UserRole;
  if (!hasPermission(role, 'trip-services:write') && !hasPermission(role, 'trip-services:status')) {
    res.status(403).json({ error: 'Access denied', required: 'trip-services:write', yourRole: role });
    return;
  }
  next();
}

// OPERATIONS can only update status/notes/time fields — strip everything else.
const OPERATIONS_ALLOWED_FIELDS = ['status', 'notes', 'startTime', 'endTime'];

function strip(body: Record<string, unknown>) {
  const { id, createdAt, updatedAt, trip, supplier, ...rest } = body;
  return rest;
}

type ServiceWithRelations = TripService & { trip: Trip; supplier: Vendor | null };

// `details` is Json (unknown shape by design — each ServiceType stores
// different fields), so it's typed as a loose record here.
function toServiceDTO(s: ServiceWithRelations) {
  return {
    id:           s.id,
    tripId:       s.tripId,
    tripName:     s.trip.destination,
    type:         s.type,
    status:       s.status,
    serviceDate:  s.serviceDate.toISOString(),
    startTime:    s.startTime,
    endTime:      s.endTime,
    supplierName: s.supplier?.name ?? null,
    costPrice:    Number(s.costPrice),
    sellPrice:    Number(s.sellPrice),
    details:      s.details as Record<string, unknown>,
    notes:        s.notes,
  };
}

// ── List (optionally by trip) ───────────────────────────────────

router.get('/', requirePermission('trip-services:read'), async (req, res) => {
  try {
    const tripId = req.query.tripId as string | undefined;
    const services = await prisma.tripService.findMany({
      where:   tripId ? { tripId } : undefined,
      include: { trip: true, supplier: true },
      orderBy: [{ serviceDate: 'asc' }, { startTime: 'asc' }],
    });
    res.json(services.map(s => toServiceDTO(s as ServiceWithRelations)));
  } catch (err) {
    console.error('[trip-services GET]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Today's services ─────────────────────────────────────────────

router.get('/today', requirePermission('trip-services:read'), async (_req, res) => {
  try {
    const start = startOfDay(new Date());
    const end   = endOfDay(new Date());
    const services = await prisma.tripService.findMany({
      where:   { serviceDate: { gte: start, lte: end } },
      orderBy: [{ startTime: 'asc' }],
    });
    res.json(services);
  } catch (err) {
    console.error('[trip-services GET /today]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Upcoming services (next N days) ──────────────────────────────

router.get('/upcoming', requirePermission('trip-services:read'), async (req, res) => {
  try {
    const days  = Number(req.query.days ?? 2);
    const start = startOfDay(new Date());
    const end   = endOfDay(addDays(new Date(), days));
    const services = await prisma.tripService.findMany({
      where:   { serviceDate: { gte: start, lte: end } },
      orderBy: [{ serviceDate: 'asc' }, { startTime: 'asc' }],
    });
    res.json(services);
  } catch (err) {
    console.error('[trip-services GET /upcoming]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Services pending confirmation (within 48h) ───────────────────

router.get('/pending-confirmation', requirePermission('trip-services:read'), async (_req, res) => {
  try {
    const now    = new Date();
    const cutoff = addHours(now, 48);
    const services = await prisma.tripService.findMany({
      where: {
        status:      'REQUESTED',
        serviceDate: { lte: cutoff },
      },
      orderBy: { serviceDate: 'asc' },
    });
    res.json(services);
  } catch (err) {
    console.error('[trip-services GET /pending-confirmation]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Create ────────────────────────────────────────────────────────

router.post('/', requirePermission('trip-services:write'), async (req: AuthRequest, res) => {
  try {
    const data = strip(req.body as Record<string, unknown>);
    const service = await prisma.tripService.create({
      data: data as Parameters<typeof prisma.tripService.create>[0]['data'],
    });
    res.status(201).json(service);
  } catch (err) {
    console.error('[trip-services POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Update (including status change) ─────────────────────────────

router.put('/:id', requireTripServiceUpdate, async (req: AuthRequest, res) => {
  try {
    let data = strip(req.body as Record<string, unknown>);

    // OPERATIONS only has trip-services:status — restrict to status/notes/time.
    if (!hasPermission(req.userRole as UserRole, 'trip-services:write')) {
      data = Object.fromEntries(
        Object.entries(data).filter(([key]) => OPERATIONS_ALLOWED_FIELDS.includes(key)),
      );
    }

    const service = await prisma.tripService.update({
      where: { id: req.params.id },
      data:  data as Parameters<typeof prisma.tripService.update>[0]['data'],
    });
    res.json(service);
  } catch (err) {
    console.error('[trip-services PUT]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Delete ────────────────────────────────────────────────────────

router.delete('/:id', requirePermission('trip-services:write'), async (req, res) => {
  try {
    await prisma.tripService.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[trip-services DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
