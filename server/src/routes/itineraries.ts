import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────

function stripMeta(body: Record<string, unknown>) {
  const { createdAt, updatedAt, days, ...rest } = body;
  return rest;
}

function normaliseDays(raw: Record<string, unknown>[]) {
  return (raw ?? []).map((d, idx) => ({
    dayNumber:   Number(d.dayNumber  ?? idx + 1),
    date:        (d.date        as string)  ?? undefined,
    title:       (d.title       as string)  ?? `Day ${idx + 1}`,
    morning:     (d.morning     as string)  ?? undefined,
    afternoon:   (d.afternoon   as string)  ?? undefined,
    evening:     (d.evening     as string)  ?? undefined,
    hotelName:   (d.hotelName   as string)  ?? undefined,
    hotelAddress: (d.hotelAddress as string) ?? undefined,
    meals:       Array.isArray(d.meals)      ? d.meals      : [],
    transfers:   (d.transfers   as string)  ?? undefined,
    activities:  Array.isArray(d.activities) ? d.activities : [],
    notes:       (d.notes       as string)  ?? undefined,
    sortOrder:   Number(d.sortOrder ?? idx),
  }));
}

const WITH_DAYS = { include: { days: { orderBy: { sortOrder: 'asc' as const } } } };

// ── CRUD ──────────────────────────────────────────────────────

// GET /api/itineraries
router.get('/', async (_req, res) => {
  try {
    res.json(await prisma.itinerary.findMany({ ...WITH_DAYS, orderBy: { createdAt: 'desc' } }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// GET /api/itineraries/:id
router.get('/:id', async (req, res) => {
  try {
    const it = await prisma.itinerary.findUnique({ where: { id: req.params.id }, ...WITH_DAYS });
    if (!it) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(it);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// POST /api/itineraries — create with days in one transaction
router.post('/', async (req, res) => {
  try {
    const { days = [], ...body } = req.body as { days?: Record<string, unknown>[]; [k: string]: unknown };
    const { updatedAt, createdAt, ...iData } = stripMeta(body as Record<string, unknown>);
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
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/itineraries/:id — update header + replace all days atomically
router.put('/:id', async (req, res) => {
  try {
    const { days = [], ...body } = req.body as { days?: Record<string, unknown>[]; [k: string]: unknown };
    const { updatedAt, createdAt, id, ...iData } = stripMeta(body as Record<string, unknown>);
    const normDays = normaliseDays(days as Record<string, unknown>[]);

    const it = await prisma.$transaction(async (tx) => {
      await tx.itineraryDay.deleteMany({ where: { itineraryId: req.params.id } });
      return tx.itinerary.update({
        where: { id: req.params.id },
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
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/itineraries/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.itineraryDay.deleteMany({ where: { itineraryId: req.params.id } });
    await prisma.itinerary.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[itineraries DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Status update ─────────────────────────────────────────────

router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body as { status: string };
    const it = await prisma.itinerary.update({
      where: { id: req.params.id },
      data:  { status },
      ...WITH_DAYS,
    });
    res.json(it);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Auto-fill from Trip ───────────────────────────────────────

router.get('/from-trip/:tripId', requireAuth, async (req, res) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.tripId as string } });
    if (!trip) { res.status(404).json({ error: 'Trip not found' }); return; }

    // Derive number of days from dates
    let numDays = 3;
    if (trip.departure && trip.returnDate) {
      const diff = Math.round(
        (new Date(trip.returnDate).getTime() - new Date(trip.departure).getTime()) / 86_400_000
      );
      if (diff > 0) numDays = diff + 1;
    }

    // Build default day stubs
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
      tripId:       trip.id,
      title:        `${trip.customer} — ${trip.destination}`,
      destination:  trip.destination,
      customerName: trip.customer,
      customerPhone: trip.phone,
      customerEmail: trip.email ?? undefined,
      startDate:    trip.departure   ?? undefined,
      endDate:      trip.returnDate  ?? undefined,
      pax:          trip.pax,
      days,
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Auto-fill from Quotation ──────────────────────────────────

router.get('/from-quotation/:quotationId', requireAuth, async (req, res) => {
  try {
    const q = await prisma.quotation.findUnique({
      where:   { id: req.params.quotationId as string },
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

    // Extract hotel items for auto-fill
    const hotelItems = q.items.filter((it: { category: string }) => it.category === 'hotel');

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
        hotelName:  hotel ? (hotel as { description: string; vendorName: string | null }).description : undefined,
        meals:      ['breakfast'] as string[],
        activities: q.items.filter((it: { category: string }) => it.category === 'activity').map((it: { description: string }) => it.description),
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
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;
