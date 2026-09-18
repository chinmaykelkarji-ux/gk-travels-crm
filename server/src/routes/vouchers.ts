import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';
import { logActivity } from '../lib/activity.js';

const router = Router();
router.use(requireAuth);

// Reading vouchers goes with reading trips; issuing/editing needs
// vouchers:write (ADMIN, BOOKING, OPERATIONS).

// ── Helper ────────────────────────────────────────────────────

function strip(body: Record<string, unknown>) {
  const { createdAt, updatedAt, ...rest } = body;
  return rest;
}

// ── Auto-fill from Trip (declared before /:id) ───────────────

router.get('/from-trip/:tripId', requirePermission('trips:read'), async (req, res) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: String(req.params.tripId) } });
    if (!trip) { res.status(404).json({ error: 'Trip not found' }); return; }

    res.json({
      tripId:        trip.id,
      customerName:  trip.customer,
      customerPhone: trip.phone || undefined,
      destination:   trip.destination,
      pax:           trip.pax,
      checkIn:       trip.departure   ?? undefined,
      checkOut:      trip.returnDate  ?? undefined,
      pickupDate:    trip.departure   ?? undefined,
      departureDate: trip.departure   ?? undefined,
    });
  } catch (err) {
    console.error('[vouchers from-trip]', err);
    res.status(500).json({ error: 'Failed to prefill voucher' });
  }
});

// ── List ──────────────────────────────────────────────────────

router.get('/', requirePermission('trips:read'), async (_req, res) => {
  try {
    res.json(await prisma.voucher.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (err) {
    console.error('[vouchers GET]', err);
    res.status(500).json({ error: 'Failed to load vouchers' });
  }
});

// ── Single ────────────────────────────────────────────────────

router.get('/:id', requirePermission('trips:read'), async (req, res) => {
  try {
    const v = await prisma.voucher.findUnique({ where: { id: String(req.params.id) } });
    if (!v) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(v);
  } catch (err) {
    console.error('[vouchers GET /:id]', err);
    res.status(500).json({ error: 'Failed to load voucher' });
  }
});

// ── Create ────────────────────────────────────────────────────

router.post('/', requirePermission('vouchers:write'), async (req: AuthRequest, res) => {
  try {
    const data = strip(req.body as Record<string, unknown>);
    if (typeof data.id !== 'string' || !data.id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const existed = await prisma.voucher.findUnique({ where: { id: data.id }, select: { id: true } });
    const v = await prisma.voucher.upsert({
      where:  { id: data.id },
      update: data as Parameters<typeof prisma.voucher.update>[0]['data'],
      create: data as Parameters<typeof prisma.voucher.create>[0]['data'],
    });

    if (!existed) {
      await logActivity(prisma, {
        action:      'voucher_issued',
        description: `Voucher ${v.id} issued (${v.type})`,
        entityType: 'voucher',
        entityId:   v.id,
        userId:     req.userId,
        after:      v,
      });
    }

    res.status(201).json(v);
  } catch (err) {
    console.error('[vouchers POST]', err);
    res.status(500).json({ error: 'Failed to save voucher' });
  }
});

// ── Update ────────────────────────────────────────────────────

router.put('/:id', requirePermission('vouchers:write'), async (req, res) => {
  try {
    const { id, createdAt, updatedAt, ...data } = req.body as Record<string, unknown>;
    const v = await prisma.voucher.update({
      where: { id: String(req.params.id) },
      data:  data as Parameters<typeof prisma.voucher.update>[0]['data'],
    });
    res.json(v);
  } catch (err) {
    console.error('[vouchers PUT]', err);
    res.status(500).json({ error: 'Failed to update voucher' });
  }
});

// ── Delete ────────────────────────────────────────────────────

router.delete('/:id', requirePermission('vouchers:write'), async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const v  = await prisma.voucher.delete({ where: { id } });
    await logActivity(prisma, {
      action:      'voucher_deleted',
      description: `Voucher ${id} (${v.type}) deleted`,
      entityType:  'voucher',
      entityId:    id,
      userId:      req.userId,
      before:      { id, type: v.type, status: v.status, customerName: v.customerName },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[vouchers DELETE]', err);
    res.status(500).json({ error: 'Failed to delete voucher' });
  }
});

// ── Status update ─────────────────────────────────────────────

router.put('/:id/status', requirePermission('vouchers:write'), async (req, res) => {
  try {
    const { status } = req.body as { status: string };
    const data: Record<string, unknown> = { status };
    if (status === 'issued') data.issueDate = new Date().toISOString().split('T')[0];

    const v = await prisma.voucher.update({
      where: { id: String(req.params.id) },
      data:  data as Parameters<typeof prisma.voucher.update>[0]['data'],
    });
    res.json(v);
  } catch (err) {
    console.error('[vouchers status]', err);
    res.status(500).json({ error: 'Failed to update voucher status' });
  }
});

// ── Duplicate ─────────────────────────────────────────────────

router.post('/:id/duplicate', requirePermission('vouchers:write'), async (req, res) => {
  try {
    const src = await prisma.voucher.findUnique({ where: { id: String(req.params.id) } });
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
    res.status(500).json({ error: 'Failed to duplicate voucher' });
  }
});

export default router;
