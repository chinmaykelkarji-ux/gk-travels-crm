import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────

function stripMeta(body: Record<string, unknown>) {
  const { createdAt, updatedAt, payments, ...rest } = body;
  return rest;
}

function calcOutstanding(totalCost: number, advancePaid: number, isPaid: boolean): number {
  if (isPaid) return 0;
  return Math.max(0, totalCost - advancePaid);
}

// ══ VENDORS ════════════════════════════════════════════════════

// GET /api/vendors
router.get('/', async (_req, res) => {
  try {
    res.json(await prisma.vendor.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// GET /api/vendors/:id  (with payments)
router.get('/:id', async (req, res) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where:   { id: req.params.id },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!vendor) { res.status(404).json({ error: 'Vendor not found' }); return; }
    res.json(vendor);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// POST /api/vendors
router.post('/', async (req, res) => {
  try {
    const vendor = await prisma.vendor.upsert({
      where:  { id: req.body.id },
      update: stripMeta(req.body) as Parameters<typeof prisma.vendor.update>[0]['data'],
      create: stripMeta(req.body) as Parameters<typeof prisma.vendor.create>[0]['data'],
    });
    res.status(201).json(vendor);
  } catch (err) {
    console.error('[vendors POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/vendors/:id
router.put('/:id', async (req, res) => {
  try {
    const vendor = await prisma.vendor.update({
      where: { id: req.params.id },
      data:  stripMeta(req.body) as Parameters<typeof prisma.vendor.update>[0]['data'],
    });
    res.json(vendor);
  } catch (err) {
    console.error('[vendors PUT]', err);
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/vendors/:id  (cascade deletes payments via Prisma relation)
router.delete('/:id', async (req, res) => {
  try {
    await prisma.vendorPayment.deleteMany({ where: { vendorId: req.params.id } });
    await prisma.vendor.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[vendors DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ══ VENDOR PAYMENTS ════════════════════════════════════════════

// GET /api/vendors/payments/all
router.get('/payments/all', async (_req, res) => {
  try {
    res.json(await prisma.vendorPayment.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// POST /api/vendors/payments
router.post('/payments', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const totalCost   = Number(body.totalCost   ?? 0);
    const advancePaid = Number(body.advancePaid ?? 0);
    const isPaid      = Boolean(body.isPaid);

    const data = {
      ...body,
      totalCost,
      advancePaid,
      outstanding: calcOutstanding(totalCost, advancePaid, isPaid),
    };

    const { createdAt, updatedAt, vendor, ...clean } = data as Record<string, unknown>;
    const payment = await prisma.vendorPayment.upsert({
      where:  { id: String(clean.id) },
      update: clean as Parameters<typeof prisma.vendorPayment.update>[0]['data'],
      create: clean as Parameters<typeof prisma.vendorPayment.create>[0]['data'],
    });
    res.status(201).json(payment);
  } catch (err) {
    console.error('[vendor-payments POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/vendors/payments/:id
router.put('/payments/:id', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const totalCost   = Number(body.totalCost   ?? 0);
    const advancePaid = Number(body.advancePaid ?? 0);
    const isPaid      = Boolean(body.isPaid);
    const { createdAt, updatedAt, vendor, id, ...clean } = body;

    const payment = await prisma.vendorPayment.update({
      where: { id: req.params.id },
      data:  { ...clean, totalCost, advancePaid, outstanding: calcOutstanding(totalCost, advancePaid, isPaid) },
    });
    res.json(payment);
  } catch (err) {
    console.error('[vendor-payments PUT]', err);
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/vendors/payments/:id
router.delete('/payments/:id', async (req, res) => {
  try {
    await prisma.vendorPayment.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[vendor-payments DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/vendors/payments/:id/mark-paid
router.put('/payments/:id/mark-paid', async (req, res) => {
  try {
    const { paidDate } = req.body as { paidDate?: string };
    const payment = await prisma.vendorPayment.update({
      where: { id: req.params.id },
      data:  { isPaid: true, outstanding: 0, paidDate: paidDate ?? new Date().toISOString().split('T')[0] },
    });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
