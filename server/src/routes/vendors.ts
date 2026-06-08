import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { today } from '../../../src/shared/utils/date.js';

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
router.post('/payments', async (req: AuthRequest, res) => {
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
    const existed = await prisma.vendorPayment.findUnique({ where: { id: String(clean.id) } });
    const payment = await prisma.vendorPayment.upsert({
      where:  { id: String(clean.id) },
      update: clean as Parameters<typeof prisma.vendorPayment.update>[0]['data'],
      create: clean as Parameters<typeof prisma.vendorPayment.create>[0]['data'],
    });

    if (!existed) {
      await prisma.financialTransaction.create({
        data: {
          type:            'PAYABLE',
          sourceType:      'vendor_payment',
          sourceId:        payment.id,
          vendorId:        payment.vendorId,
          tripId:          payment.tripId ?? undefined,
          amount:          payment.totalCost,
          description: payment.description ?? `Payable to ${payment.vendorName}`,
          transactionDate: today(),
          createdBy:       req.userId,
        },
      });
      await logActivity(prisma, {
        action:      'payable_created',
        description: `Payable of ₹${payment.totalCost.toLocaleString('en-IN')} recorded for vendor ${payment.vendorName}`,
        entityType: 'vendor_payment',
        entityId:   payment.id,
        userId:     req.userId,
        after:      payment,
      });
    } else if (advancePaid > existed.advancePaid) {
      const delta = advancePaid - existed.advancePaid;
      await prisma.financialTransaction.create({
        data: {
          type:            'PAYMENT_SENT',
          sourceType:      'vendor_payment',
          sourceId:        payment.id,
          vendorId:        payment.vendorId,
          tripId:          payment.tripId ?? undefined,
          amount:          delta,
          description: `Payment of ₹${delta.toLocaleString('en-IN')} recorded toward ${payment.vendorName}`,
          transactionDate: today(),
          createdBy:       req.userId,
        },
      });
      await logActivity(prisma, {
        action:      'vendor_payment_sent',
        description: `Payment of ₹${delta.toLocaleString('en-IN')} sent to vendor ${payment.vendorName}`,
        entityType: 'vendor_payment',
        entityId:   payment.id,
        userId:     req.userId,
        after:      payment,
      });
    }

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
router.put('/payments/:id/mark-paid', async (req: AuthRequest, res) => {
  try {
    const { paidDate } = req.body as { paidDate?: string };
    const date = paidDate ?? today();
    const existing = await prisma.vendorPayment.findUniqueOrThrow({ where: { id: req.params.id } });
    const remaining = Math.max(0, existing.totalCost - existing.advancePaid);

    const payment = await prisma.vendorPayment.update({
      where: { id: req.params.id },
      data:  { isPaid: true, outstanding: 0, advancePaid: existing.totalCost, paidDate: date },
    });

    if (remaining > 0) {
      await prisma.financialTransaction.create({
        data: {
          type:            'PAYMENT_SENT',
          sourceType:      'vendor_payment',
          sourceId:        payment.id,
          vendorId:        payment.vendorId,
          tripId:          payment.tripId ?? undefined,
          amount:          remaining,
          description: `Final payment of ₹${remaining.toLocaleString('en-IN')} settled to ${payment.vendorName}`,
          transactionDate: date,
          createdBy:       req.userId,
        },
      });
    }
    await logActivity(prisma, {
      action:      'vendor_payment_settled',
      description: `Vendor payment to ${payment.vendorName} marked fully paid`,
      entityType: 'vendor_payment',
      entityId:   payment.id,
      userId:     req.userId,
      after:      payment,
    });

    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
