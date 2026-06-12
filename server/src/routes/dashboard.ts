import { Router } from 'express';
import { startOfDay, endOfDay, addHours, differenceInHours, differenceInCalendarDays, parseISO, isValid, format } from 'date-fns';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';
import type { Trip, Vendor, TripService } from '@prisma/client';

const router = Router();
router.use(requireAuth);

type ServiceWithRelations = TripService & { trip: Trip; supplier: Vendor | null };

// Prisma's `details` is Json (unknown shape by design — each ServiceType
// stores different fields). `unknown` would force a cast at every call
// site, so we type it as a loose record here.
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

// ── GET /api/dashboard/today ──────────────────────────────────────

router.get('/today', requirePermission('dashboard:read'), async (_req, res) => {
  try {
    const now      = new Date();
    const start    = startOfDay(now);
    const end      = endOfDay(now);
    const todayStr = format(now, 'yyyy-MM-dd');
    const cutoff48 = addHours(now, 48);

    const [flightServices, hotelServices, vehicleServices, pendingConfRaw, allTrips, requestedServices] = await Promise.all([
      prisma.tripService.findMany({
        where:   { type: 'FLIGHT', serviceDate: { gte: start, lte: end } },
        include: { trip: true, supplier: true },
        orderBy: { startTime: 'asc' },
      }),
      prisma.tripService.findMany({
        where: {
          type: 'HOTEL',
          OR: [
            { serviceDate: { gte: start, lte: end } },
            { details: { path: ['checkOut'], equals: todayStr } },
          ],
        },
        include: { trip: true, supplier: true },
        orderBy: { startTime: 'asc' },
      }),
      prisma.tripService.findMany({
        where:   { type: 'VEHICLE', serviceDate: { gte: start, lte: end } },
        include: { trip: true, supplier: true },
        orderBy: { startTime: 'asc' },
      }),
      prisma.tripService.findMany({
        where:   { status: 'REQUESTED', serviceDate: { lte: cutoff48 } },
        include: { trip: true, supplier: true },
        orderBy: { serviceDate: 'asc' },
      }),
      prisma.trip.findMany({
        where:  { status: 'confirmed', balanceDue: { gt: 0 } },
        select: { id: true, destination: true, customer: true, phone: true, balanceDue: true, departure: true },
      }),
      prisma.tripService.findMany({
        where:   { status: 'REQUESTED' },
        include: { trip: true, supplier: true },
      }),
    ]);

    // ── Flights: split by direction (details.direction === 'IN' → arrival) ──
    const todayDepartures = flightServices.filter(s => (s.details as Record<string, unknown> | null)?.direction !== 'IN').map(toServiceDTO);
    const todayArrivals   = flightServices.filter(s => (s.details as Record<string, unknown> | null)?.direction === 'IN').map(toServiceDTO);

    // ── Hotels: split into check-ins (serviceDate = today) and check-outs (details.checkOut = today) ──
    const hotelCheckIns  = hotelServices.filter(s => s.serviceDate >= start && s.serviceDate <= end).map(toServiceDTO);
    const hotelCheckOuts = hotelServices.filter(s => (s.details as Record<string, unknown> | null)?.checkOut === todayStr).map(toServiceDTO);

    const vehicleSchedules   = vehicleServices.map(toServiceDTO);
    const pendingConfirmations = pendingConfRaw.map(toServiceDTO);

    // ── Pending payments: confirmed trips with balance due, departing within 7 days ──
    const pendingPayments = allTrips
      .map(trip => {
        if (!trip.departure) return null;
        const departureDate = parseISO(trip.departure);
        if (!isValid(departureDate)) return null;
        const daysUntilDeparture = differenceInCalendarDays(departureDate, now);
        if (daysUntilDeparture < 0 || daysUntilDeparture > 7) return null;
        return {
          tripId:             trip.id,
          tripName:           trip.destination,
          customerName:       trip.customer,
          customerPhone:      trip.phone,
          amountDue:          trip.balanceDue,
          daysUntilDeparture,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    // ── Upcoming risks: trips departing within 48h with unconfirmed services ──
    const servicesByTrip = new Map<string, ServiceWithRelations[]>();
    for (const s of requestedServices) {
      const list = servicesByTrip.get(s.tripId) ?? [];
      list.push(s);
      servicesByTrip.set(s.tripId, list);
    }

    const upcomingRisks: Array<{
      tripId: string;
      tripName: string;
      departureDate: string;
      unconfirmedServices: ReturnType<typeof toServiceDTO>[];
      hoursUntilDeparture: number;
    }> = [];

    for (const [tripId, services] of servicesByTrip) {
      const trip = services[0].trip;
      if (!trip.departure) continue;
      const departureDate = parseISO(trip.departure);
      if (!isValid(departureDate)) continue;

      const hoursUntilDeparture = differenceInHours(departureDate, now);
      if (hoursUntilDeparture < 0 || hoursUntilDeparture > 48) continue;

      upcomingRisks.push({
        tripId,
        tripName:            trip.destination,
        departureDate:       trip.departure,
        unconfirmedServices: services.map(toServiceDTO),
        hoursUntilDeparture,
      });
    }

    res.json({
      todayDepartures,
      todayArrivals,
      hotelCheckIns,
      hotelCheckOuts,
      vehicleSchedules,
      pendingConfirmations,
      pendingPayments,
      upcomingRisks,
    });
  } catch (err) {
    console.error('[dashboard GET /today]', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
