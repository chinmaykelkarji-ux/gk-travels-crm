import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthRequest } from '../middleware/auth.js';
import { requirePermission, requireAnyPermission } from '../lib/permissions.js';
import { logActivity } from '../lib/activity.js';
import { redactVendor, canSeeBankDetails } from '../lib/redact.js';
import { today } from '../../../src/shared/utils/date.js';
import { kindFromLegacyType } from '../../../src/shared/contracts/masters.js';
import { normalizePhone } from '../../../src/shared/calc/phone.js';

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────

// Timestamps and relations are server-owned. Bank details are accepted only
// from roles that may see them; otherwise the stored value is kept, so an
// OPERATIONS user editing a phone number cannot wipe (or set) the account
// the accounts team pays into.
function stripMeta(body: Record<string, unknown>, role: string | undefined): Record<string, unknown> {
  const { createdAt, updatedAt, payments, tripServices, salesQuoteItems, bankDetails, hotels, vehicles, drivers, activities, kind, phoneNormalized, ...rest } = body;
  // The classic screen edits "type"; the v2 kind and normalised phone follow it.
  const derived = {
    ...(typeof rest.type === 'string' ? { kind: kindFromLegacyType(rest.type) } : {}),
    ...(typeof rest.phone === 'string' ? { phoneNormalized: normalizePhone(rest.phone) } : {}),
  };
  return canSeeBankDetails(role) && bankDetails !== undefined ? { ...rest, ...derived, bankDetails } : { ...rest, ...derived };
}

function calcOutstanding(totalCost: number, advancePaid: number, isPaid: boolean): number {
  if (isPaid) return 0;
  return Math.max(0, totalCost - advancePaid);
}

// ══ VENDOR PAYMENTS (payables — accounts only) ══════════════════
// Declared before `/:id` so `/payments/...` is not captured as a vendor id.

// GET /api/vendors/payments/all
router.get('/payments/all', requirePermission('finance:read'), async (_req, res) => {
  try {
    res.json(await prisma.vendorPayment.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (err) {
    console.error('[vendor-payments GET]', err);
    res.status(500).json({ error: 'Failed to load vendor payments' });
  }
});

// POST /api/vendors/payments
router.post('/payments', requirePermission('finance:write'), async (req: AuthRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (typeof body.id !== 'string' || !body.id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const totalCost   = Number(body.totalCost   ?? 0);
    const advancePaid = Number(body.advancePaid ?? 0);
    const isPaid      = Boolean(body.isPaid);

    const { createdAt, updatedAt, vendor, ...clean } = {
      ...body,
      totalCost,
      advancePaid,
      outstanding: calcOutstanding(totalCost, advancePaid, isPaid),
    } as Record<string, unknown>;

    const existed = await prisma.vendorPayment.findUnique({ where: { id: body.id } });
    const payment = await prisma.vendorPayment.upsert({
      where:  { id: body.id },
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
          description:     payment.description ?? `Payable to ${payment.vendorName}`,
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
          description:     `Payment of ₹${delta.toLocaleString('en-IN')} recorded toward ${payment.vendorName}`,
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
    res.status(500).json({ error: 'Failed to save vendor payment' });
  }
});

// PUT /api/vendors/payments/:id
router.put('/payments/:id', requirePermission('finance:write'), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const totalCost   = Number(body.totalCost   ?? 0);
    const advancePaid = Number(body.advancePaid ?? 0);
    const isPaid      = Boolean(body.isPaid);
    const { createdAt, updatedAt, vendor, id, ...clean } = body;

    const payment = await prisma.vendorPayment.update({
      where: { id: String(req.params.id) },
      data:  { ...clean, totalCost, advancePaid, outstanding: calcOutstanding(totalCost, advancePaid, isPaid) },
    });
    res.json(payment);
  } catch (err) {
    console.error('[vendor-payments PUT]', err);
    res.status(500).json({ error: 'Failed to update vendor payment' });
  }
});

// DELETE /api/vendors/payments/:id
router.delete('/payments/:id', requirePermission('finance:write'), async (req, res) => {
  try {
    await prisma.vendorPayment.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[vendor-payments DELETE]', err);
    res.status(500).json({ error: 'Failed to delete vendor payment' });
  }
});

// PUT /api/vendors/payments/:id/mark-paid
router.put('/payments/:id/mark-paid', requirePermission('finance:write'), async (req: AuthRequest, res) => {
  try {
    const { paidDate } = req.body as { paidDate?: string };
    const date = paidDate ?? today();
    const existing = await prisma.vendorPayment.findUniqueOrThrow({ where: { id: String(req.params.id) } });
    const remaining = Math.max(0, existing.totalCost - existing.advancePaid);

    const payment = await prisma.vendorPayment.update({
      where: { id: existing.id },
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
          description:     `Final payment of ₹${remaining.toLocaleString('en-IN')} settled to ${payment.vendorName}`,
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
    console.error('[vendor-payments mark-paid]', err);
    res.status(500).json({ error: 'Failed to settle vendor payment' });
  }
});

// ══ VENDORS ════════════════════════════════════════════════════

// GET /api/vendors
router.get('/', requireAnyPermission('suppliers:read', 'finance:read'), async (req: AuthRequest, res) => {
  try {
    const rows = await prisma.vendor.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(rows.map(v => redactVendor(v, req.userRole)));
  } catch (err) {
    console.error('[vendors GET]', err);
    res.status(500).json({ error: 'Failed to load vendors' });
  }
});

// GET /api/vendors/:id  (payments included only for finance roles)
router.get('/:id', requireAnyPermission('suppliers:read', 'finance:read'), async (req: AuthRequest, res) => {
  try {
    const includePayments = canSeeBankDetails(req.userRole);
    const vendor = await prisma.vendor.findUnique({
      where:   { id: String(req.params.id) },
      include: includePayments ? { payments: { orderBy: { createdAt: 'desc' } } } : undefined,
    });
    if (!vendor) { res.status(404).json({ error: 'Vendor not found' }); return; }
    res.json(redactVendor(vendor, req.userRole));
  } catch (err) {
    console.error('[vendors GET /:id]', err);
    res.status(500).json({ error: 'Failed to load vendor' });
  }
});

// POST /api/vendors
router.post('/', requirePermission('suppliers:write'), async (req: AuthRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (typeof body.id !== 'string' || !body.id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const data = stripMeta(body, req.userRole);
    const vendor = await prisma.vendor.upsert({
      where:  { id: body.id },
      update: data as Parameters<typeof prisma.vendor.update>[0]['data'],
      create: data as Parameters<typeof prisma.vendor.create>[0]['data'],
    });
    res.status(201).json(redactVendor(vendor, req.userRole));
  } catch (err) {
    console.error('[vendors POST]', err);
    res.status(500).json({ error: 'Failed to save vendor' });
  }
});

// PUT /api/vendors/:id
router.put('/:id', requirePermission('suppliers:write'), async (req: AuthRequest, res) => {
  try {
    const { id: _ignored, ...data } = stripMeta(req.body as Record<string, unknown>, req.userRole);
    const vendor = await prisma.vendor.update({
      where: { id: String(req.params.id) },
      data:  data as Parameters<typeof prisma.vendor.update>[0]['data'],
    });
    res.json(redactVendor(vendor, req.userRole));
  } catch (err) {
    console.error('[vendors PUT]', err);
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

// DELETE /api/vendors/:id — ADMIN only. Refused while payables or trip
// services reference the vendor: financial history is never cascaded away.
router.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const [paymentCount, serviceCount, quoteItemCount] = await Promise.all([
      prisma.vendorPayment.count({ where: { vendorId: id } }),
      prisma.tripService.count({ where: { supplierId: id } }),
      prisma.salesQuoteItem.count({ where: { supplierId: id } }),
    ]);
    if (paymentCount > 0 || serviceCount > 0 || quoteItemCount > 0) {
      res.status(409).json({
        error: `Cannot delete vendor — ${paymentCount} payment(s), ${serviceCount} trip service(s) and ${quoteItemCount} quote item(s) reference it. Mark it inactive instead.`,
      });
      return;
    }

    const vendor = await prisma.vendor.delete({ where: { id } });
    await logActivity(prisma, {
      action:      'vendor_deleted',
      description: `Vendor ${vendor.name} deleted`,
      entityType:  'vendor',
      entityId:    id,
      userId:      req.userId,
      before:      { id, name: vendor.name, type: vendor.type },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[vendors DELETE]', err);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

export default router;
