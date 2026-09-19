import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';

const router = Router();
router.use(requireAuth);

// Reading itineraries goes with reading trips; building them needs trips:write.

// ── Helpers ───────────────────────────────────────────────────

function stripMeta(body: Record<string, unknown>) {
  const { createdAt, updatedAt, days, ...rest } = body;
  return rest;
}

function normaliseDays(raw: Record<string, unknown>[]) {
  return (raw ?? []).map((d, idx) => ({
    dayNumber:    Number(d.dayNumber  ?? idx + 1),
    date:         (d.date         as string)  ?? undefined,
    title:        (d.title        as string)  ?? `Day ${idx + 1}`,
    morning:      (d.morning      as string)  ?? undefined,
    afternoon:    (d.afternoon    as string)  ?? undefined,
    evening:      (d.evening      as string)  ?? undefined,
    hotelName:    (d.hotelName    as string)  ?? undefined,
    hotelAddress: (d.hotelAddress as string)  ?? undefined,
    meals:        Array.isArray(d.meals)      ? d.meals      : [],
    transfers:    (d.transfers    as string)  ?? undefined,
    activities:   Array.isArray(d.activities) ? d.activities : [],
    notes:        (d.notes        as string)  ?? undefined,
    sortOrder:    Number(d.sortOrder ?? idx),
  }));
}

const WITH_DAYS = { include: { days: { orderBy: { sortOrder: 'asc' as const } } } };

// V2 itineraries (Phase 3.5) carry timed items and internal notes that this
// builder does not know about; replacing their days here would drop them.
async function refuseV2(id: string, res: import('express').Response): Promise<boolean> {
  const it = await prisma.itinerary.findUnique({ where: { id }, select: { format: true, tripId: true } });
  if (it?.format !== 'V2') return false;
  res.status(409).json({ error: `This itinerary is edited in the trip workspace${it.tripId ? ` (trip ${it.tripId}, Itinerary tab)` : ''}.`, code: 'STATE_CONFLICT' });
  return true;
}

// ── Auto-fill from Trip / Quotation (declared before /:id) ────

router.get('/from-trip/:tripId', requirePermission('trips:read'), async (req, res) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: String(req.params.tripId) } });
    if (!trip) { res.status(404).json({ error: 'Trip not found' }); return; }

    let numDays = 3;
    if (trip.departure && trip.returnDate) {
      const diff = Math.round(
        (new Date(trip.returnDate).getTime() - new Date(trip.departure).getTime()) / 86_400_000
      );
      if (diff > 0) numDays = diff + 1;
    }

    const days = Array.from({ length: numDays }, (_, i) => {
      const dayDate = trip.departure
        ? new Date(new Date(trip.departure).getTime() + i * 86_400_000).toISOString().split('T')[0]
        : undefined;
      const isFirst = i === 0;
      const isLast  = i === numDays - 1;
      return {
        dayNumber:  i + 1,
        date:       dayDate,
        title:      isFirst ? `Arrival — ${trip.destination}` : isLast ? `Departure — ${trip.destination}` : `Day ${i + 1} — ${trip.destination}`,
        morning:    isFirst ? 'Arrive and check-in' : '',
        afternoon:  '',
        evening:    '',
        meals:      ['breakfast'] as string[],
        activities: [],
        sortOrder:  i,
      };
    });

    res.json({
      tripId:        trip.id,
      title:         `${trip.customer} — ${trip.destination}`,
      destination:   trip.destination,
      customerName:  trip.customer,
      customerPhone: trip.phone,
      customerEmail: trip.email ?? undefined,
      startDate:     trip.departure   ?? undefined,
      endDate:       trip.returnDate  ?? undefined,
      pax:           trip.pax,
      days,
    });
  } catch (err) {
    console.error('[itineraries from-trip]', err);
    res.status(500).json({ error: 'Failed to prefill itinerary' });
  }
});

router.get('/from-quotation/:quotationId', requirePermission('sales-quotes:read'), async (req, res) => {
  try {
    const q = await prisma.quotation.findUnique({
      where:   { id: String(req.params.quotationId) },
      include: { items: true },
    });
    if (!q) { res.status(404).json({ error: 'Quotation not found' }); return; }

    let numDays = 3;
    if (q.startDate && q.endDate) {
      const diff = Math.round(
        (new Date(q.endDate).getTime() - new Date(q.startDate).getTime()) / 86_400_000
      );
      if (diff > 0) numDays = diff + 1;
    }

    const hotelItems = q.items.filter(it => it.category === 'hotel');

    const days = Array.from({ length: numDays }, (_, i) => {
      const dayDate = q.startDate
        ? new Date(new Date(q.startDate).getTime() + i * 86_400_000).toISOString().split('T')[0]
        : undefined;
      const isFirst = i === 0;
      const isLast  = i === numDays - 1;
      const hotel   = hotelItems[Math.min(i, hotelItems.length - 1)];
      return {
        dayNumber:  i + 1,
        date:       dayDate,
        title:      isFirst ? `Arrival — ${q.destination}` : isLast ? `Departure — ${q.destination}` : `Day ${i + 1} — ${q.destination}`,
        morning:    isFirst ? 'Arrive and check-in' : '',
        afternoon:  '',
        evening:    '',
        hotelName:  hotel ? hotel.description : undefined,
        meals:      ['breakfast'] as string[],
        activities: q.items.filter(it => it.category === 'activity').map(it => it.description),
        sortOrder:  i,
      };
    });

    res.json({
      quotationId:   q.id,
      title:         `${q.customerName} — ${q.destination}`,
      destination:   q.destination,
      customerName:  q.customerName,
      customerPhone: q.customerPhone ?? undefined,
      customerEmail: q.customerEmail ?? undefined,
      startDate:     q.startDate     ?? undefined,
      endDate:       q.endDate       ?? undefined,
      pax:           q.pax,
      days,
    });
  } catch (err) {
    console.error('[itineraries from-quotation]', err);
    res.status(500).json({ error: 'Failed to prefill itinerary' });
  }
});

// ── CRUD ──────────────────────────────────────────────────────

// GET /api/itineraries
router.get('/', requirePermission('trips:read'), async (_req, res) => {
  try {
    res.json(await prisma.itinerary.findMany({ ...WITH_DAYS, orderBy: { createdAt: 'desc' } }));
  } catch (err) {
    console.error('[itineraries GET]', err);
    res.status(500).json({ error: 'Failed to load itineraries' });
  }
});

// GET /api/itineraries/:id
router.get('/:id', requirePermission('trips:read'), async (req, res) => {
  try {
    const it = await prisma.itinerary.findUnique({ where: { id: String(req.params.id) }, ...WITH_DAYS });
    if (!it) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(it);
  } catch (err) {
    console.error('[itineraries GET /:id]', err);
    res.status(500).json({ error: 'Failed to load itinerary' });
  }
});

// POST /api/itineraries — create with days in one transaction
router.post('/', requirePermission('trips:write'), async (req, res) => {
  try {
    const { days = [], ...body } = req.body as { days?: Record<string, unknown>[]; [k: string]: unknown };
    const iData = stripMeta(body as Record<string, unknown>);

    // A trip may only have one linked itinerary.
    const tripId = iData.tripId as string | undefined;
    if (tripId) {
      const existing = await prisma.itinerary.findFirst({ where: { tripId } });
      if (existing) {
        res.status(409).json({ error: 'This trip already has a linked itinerary', itineraryId: existing.id });
        return;
      }
    }

    const normDays = normaliseDays(days as Record<string, unknown>[]);

    const it = await prisma.itinerary.create({
      data: {
        ...(iData as Parameters<typeof prisma.itinerary.create>[0]['data']),
        days: { create: normDays },
      },
      ...WITH_DAYS,
    });
    res.status(201).json(it);
  } catch (err) {
    console.error('[itineraries POST]', err);
    res.status(500).json({ error: 'Failed to save itinerary' });
  }
});

// PUT /api/itineraries/:id — update header + replace all days atomically
router.put('/:id', requirePermission('trips:write'), async (req, res) => {
  try {
    const id = String(req.params.id);
    if (await refuseV2(id, res)) return;
    const { days = [], ...body } = req.body as { days?: Record<string, unknown>[]; [k: string]: unknown };
    const { id: _ignored, ...iData } = stripMeta(body as Record<string, unknown>);
    const normDays = normaliseDays(days as Record<string, unknown>[]);

    const it = await prisma.$transaction(async (tx) => {
      await tx.itineraryDay.deleteMany({ where: { itineraryId: id } });
      return tx.itinerary.update({
        where: { id },
        data:  {
          ...(iData as Parameters<typeof prisma.itinerary.update>[0]['data']),
          days: { create: normDays },
        },
        ...WITH_DAYS,
      });
    });
    res.json(it);
  } catch (err) {
    console.error('[itineraries PUT]', err);
    res.status(500).json({ error: 'Failed to update itinerary' });
  }
});

// DELETE /api/itineraries/:id
router.delete('/:id', requirePermission('trips:write'), async (req, res) => {
  try {
    const id = String(req.params.id);
    if (await refuseV2(id, res)) return;
    await prisma.$transaction([
      prisma.itineraryDay.deleteMany({ where: { itineraryId: id } }),
      prisma.itinerary.delete({ where: { id } }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[itineraries DELETE]', err);
    res.status(500).json({ error: 'Failed to delete itinerary' });
  }
});

// ── Status update ─────────────────────────────────────────────

router.put('/:id/status', requirePermission('trips:write'), async (req, res) => {
  try {
    const { status } = req.body as { status: string };
    const it = await prisma.itinerary.update({
      where: { id: String(req.params.id) },
      data:  { status },
      ...WITH_DAYS,
    });
    res.json(it);
  } catch (err) {
    console.error('[itineraries status]', err);
    res.status(500).json({ error: 'Failed to update itinerary status' });
  }
});

export default router;
