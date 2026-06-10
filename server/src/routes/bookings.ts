import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    res.json(await prisma.booking.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (err) {
    console.error('BOOKING API ERROR:', err);
    if (err instanceof Error) {
      console.error('MESSAGE:', err.message);
      console.error('STACK:', err.stack);
    }
    res.status(500).json({
      error: 'Booking API failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const existed = await prisma.booking.findUnique({ where: { id: req.body.id }, select: { id: true } });
    const b = await prisma.booking.upsert({
      where:  { id: req.body.id },
      update: sanitize(req.body) as Parameters<typeof prisma.booking.update>[0]['data'],
      create: sanitize(req.body) as Parameters<typeof prisma.booking.create>[0]['data'],
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
  } catch (err) {
    console.error('BOOKING API ERROR:', err);
    if (err instanceof Error) {
      console.error('MESSAGE:', err.message);
      console.error('STACK:', err.stack);
    }
    res.status(500).json({
      error: 'Booking API failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const before = await prisma.booking.findUnique({ where: { id: req.params.id } });
    const b = await prisma.booking.update({
      where: { id: req.params.id },
      data:  sanitize(req.body) as Parameters<typeof prisma.booking.update>[0]['data'],
    });

    if (before && before.status !== 'cancelled' && b.status === 'cancelled') {
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
  } catch (err) {
    console.error('BOOKING API ERROR:', err);
    if (err instanceof Error) {
      console.error('MESSAGE:', err.message);
      console.error('STACK:', err.stack);
    }
    res.status(500).json({
      error: 'Booking API failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.booking.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('BOOKING API ERROR:', err);
    if (err instanceof Error) {
      console.error('MESSAGE:', err.message);
      console.error('STACK:', err.stack);
    }
    res.status(500).json({
      error: 'Booking API failed',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

function sanitize(body: Record<string, unknown>) {
  const { createdAt, updatedAt, ...rest } = body;
  return rest;
}

export default router;
