import { Router, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';
import { logActivity } from '../lib/activity.js';
import { redactBooking } from '../lib/redact.js';

const router = Router();
router.use(requireAuth);

function fail(res: Response, err: unknown) {
  console.error('BOOKING API ERROR:', err);
  res.status(500).json({ error: 'Booking API failed' });
}

// ── List ──────────────────────────────────────────────────────
// Supplier cost / margin columns are zeroed for roles without commercial
// access (OPERATIONS) — see lib/redact.ts.

router.get('/', requirePermission('bookings:read'), async (req: AuthRequest, res) => {
  try {
    const rows = await prisma.booking.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(rows.map(b => redactBooking(b, req.userRole)));
  } catch (err) { fail(res, err); }
});

// ── Create (upsert on client id) ──────────────────────────────

router.post('/', requirePermission('bookings:write'), async (req: AuthRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (typeof body.id !== 'string' || !body.id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const data    = sanitize(body);
    const existed = await prisma.booking.findUnique({ where: { id: body.id }, select: { id: true } });
    const b = await prisma.booking.upsert({
      where:  { id: body.id },
      update: data as Parameters<typeof prisma.booking.update>[0]['data'],
      create: data as Parameters<typeof prisma.booking.create>[0]['data'],
    });

    // Brand-new booking → post to the activity feed. Receivables are now
    // raised exclusively from GST Invoices (see invoiceService.createInvoice),
    // not automatically on booking creation.
    if (!existed) {
      await logActivity(prisma, {
        action:      'booking_created',
        description: `Booking ${b.id} (${b.type}) created for ${b.customerName}`,
        entityType: 'booking',
        entityId:   b.id,
        userId:     req.userId,
        after:      b,
      });
    }

    res.status(201).json(b);
  } catch (err) { fail(res, err); }
});

// ── Update ────────────────────────────────────────────────────

router.put('/:id', requirePermission('bookings:write'), async (req: AuthRequest, res) => {
  try {
    const id     = String(req.params.id);
    const before = await prisma.booking.findUnique({ where: { id } });
    if (!before) { res.status(404).json({ error: 'Booking not found' }); return; }

    const b = await prisma.booking.update({
      where: { id },
      data:  sanitize(req.body as Record<string, unknown>) as Parameters<typeof prisma.booking.update>[0]['data'],
    });

    if (before.status !== 'cancelled' && b.status === 'cancelled') {
      await logActivity(prisma, {
        action:      'booking_cancelled',
        description: `Booking ${b.id} (${b.type}) cancelled for ${b.customerName}`,
        entityType:  'booking',
        entityId:    b.id,
        userId:      req.userId,
        before:      { status: before.status },
        after:       { status: b.status },
      });
    }

    res.json(b);
  } catch (err) { fail(res, err); }
});

// ── Delete ────────────────────────────────────────────────────
// Refused while the booking is on an issued invoice or has money recorded
// against it; those records must not be orphaned.

router.delete('/:id', requirePermission('bookings:write'), async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const booking = await prisma.booking.findUnique({ where: { id }, select: { id: true, invoiceId: true, type: true, customerName: true } });
    if (!booking) { res.status(404).json({ error: 'Booking not found' }); return; }

    if (booking.invoiceId) {
      res.status(409).json({ error: 'Cannot delete a booking that is on an invoice. Cancel the invoice first.' });
      return;
    }

    const [paymentCount, receivableCount] = await Promise.all([
      prisma.payment.count({ where: { bookingId: id } }),
      prisma.receivable.count({ where: { bookingId: id } }),
    ]);
    if (paymentCount > 0 || receivableCount > 0) {
      res.status(409).json({
        error: `Cannot delete booking — ${paymentCount} payment(s) and ${receivableCount} receivable(s) reference it. Cancel the booking instead.`,
      });
      return;
    }

    await prisma.$transaction([
      prisma.task.updateMany({ where: { bookingId: id }, data: { bookingId: null } }),
      prisma.booking.delete({ where: { id } }),
    ]);

    await logActivity(prisma, {
      action:      'booking_deleted',
      description: `Booking ${id} (${booking.type}) deleted for ${booking.customerName}`,
      entityType:  'booking',
      entityId:    id,
      userId:      req.userId,
      before:      booking,
    });

    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

// Server-owned columns are never taken from the client: timestamps, and the
// invoice lock that invoiceService sets/clears.
function sanitize(body: Record<string, unknown>) {
  const { createdAt, updatedAt, invoiceId, ...rest } = body;
  return rest;
}

export default router;
