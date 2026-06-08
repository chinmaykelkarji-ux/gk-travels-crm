import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { logActivity } from '../services/activityService.js';

const router = Router();
router.use(requireAuth);

// ── Helper ────────────────────────────────────────────────────

function strip(body: Record<string, unknown>) {
  const { createdAt, updatedAt, ...rest } = body;
  return rest;
}

// ── List ──────────────────────────────────────────────────────

router.get('/', async (_req, res) => {
  try {
    res.json(await prisma.voucher.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Single ────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const v = await prisma.voucher.findUnique({ where: { id: req.params.id } });
    if (!v) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(v);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Create ────────────────────────────────────────────────────

router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = strip(req.body as Record<string, unknown>);
    const existed = await prisma.voucher.findUnique({ where: { id: String(data.id) }, select: { id: true } });
    const v    = await prisma.voucher.upsert({
      where:  { id: String(data.id) },
      update: data as Parameters<typeof prisma.voucher.update>[0]['data'],
      create: data as Parameters<typeof prisma.voucher.create>[0]['data'],
    });

    if (!existed) {
      await logActivity(prisma, {
        type:       'voucher_issued',
        message:    `Voucher ${v.id} issued (${v.type})`,
        entityType: 'voucher',
        entityId:   v.id,
        userId:     req.userId,
        after:      v,
      });
    }

    res.status(201).json(v);
  } catch (err) {
    console.error('[vouchers POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Update ────────────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const { id, createdAt, updatedAt, ...data } = req.body as Record<string, unknown>;
    const v = await prisma.voucher.update({
      where: { id: req.params.id },
      data:  data as Parameters<typeof prisma.voucher.update>[0]['data'],
    });
    res.json(v);
  } catch (err) {
    console.error('[vouchers PUT]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Delete ────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    await prisma.voucher.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[vouchers DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Status update ─────────────────────────────────────────────

router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body as { status: string };
    const data: Record<string, unknown> = { status };
    if (status === 'issued') data.issueDate = new Date().toISOString().split('T')[0];

    const v = await prisma.voucher.update({
      where: { id: req.params.id },
      data:  data as Parameters<typeof prisma.voucher.update>[0]['data'],
    });
    res.json(v);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Duplicate ─────────────────────────────────────────────────

router.post('/:id/duplicate', async (req, res) => {
  try {
    const src = await prisma.voucher.findUnique({ where: { id: req.params.id } });
    if (!src) { res.status(404).json({ error: 'Not found' }); return; }

    const existing = await prisma.voucher.findMany({ select: { id: true } });
    const year     = new Date().getFullYear();
    const seq      = existing.reduce((max, v) => {
      const n = parseInt((v.id || '').split('-')[2] ?? '0', 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0) + 1;
    const newId = `VCH-${year}-${String(seq).padStart(4, '0')}`;

    const { id, voucherNumber, status, issueDate, createdAt, updatedAt, ...rest } = src;

    const v = await prisma.voucher.create({
      data: {
        ...(rest as Parameters<typeof prisma.voucher.create>[0]['data']),
        id:            newId,
        voucherNumber: newId,
        status:        'draft',
        createdDate:   new Date().toISOString().split('T')[0],
      },
    });
    res.status(201).json(v);
  } catch (err) {
    console.error('[vouchers duplicate]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Auto-fill from Trip ───────────────────────────────────────

router.get('/from-trip/:tripId', async (req, res) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.tripId } });
    if (!trip) { res.status(404).json({ error: 'Trip not found' }); return; }

    res.json({
      tripId:       trip.id,
      customerName: trip.customer,
      customerPhone: trip.phone || undefined,
      destination:  trip.destination,
      pax:          trip.pax,
      checkIn:      trip.departure   ?? undefined,
      checkOut:     trip.returnDate  ?? undefined,
      pickupDate:   trip.departure   ?? undefined,
      departureDate: trip.departure  ?? undefined,
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;
