import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const all = await prisma.payment.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({
      customerPayments: all.filter(p => p.type === 'customer'),
      supplierPayments: all.filter(p => p.type === 'supplier'),
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const existed = await prisma.payment.findUnique({ where: { id: req.body.id }, select: { id: true } });
    const p = await prisma.payment.upsert({
      where:  { id: req.body.id },
      update: sanitize(req.body) as Parameters<typeof prisma.payment.update>[0]['data'],
      create: sanitize(req.body) as Parameters<typeof prisma.payment.create>[0]['data'],
    });

    // Every newly recorded payment posts a financial transaction + activity
    // entry — keeps the central ledger and activity feed reflecting reality
    // even though the existing UI still owns balance recalculation client-side.
    if (!existed) {
      await prisma.financialTransaction.create({
        data: {
          type:            p.type === 'customer' ? 'PAYMENT_RECEIVED' : 'PAYMENT_SENT',
          sourceType:      p.type === 'customer' ? 'trip' : 'vendor_payment',
          sourceId:        p.tripId ?? p.bookingId ?? p.id,
          customerId:      p.customerId ?? undefined,
          tripId:          p.tripId ?? undefined,
          bookingId:       p.bookingId ?? undefined,
          amount:          p.amount,
          description: `${p.type === 'customer' ? 'Payment received' : 'Payment sent'} via ${p.method}${p.reference ? ` (Ref: ${p.reference})` : ''}`,
          transactionDate: p.date,
          paymentMode:     p.method,
          reference:       p.reference ?? undefined,
          createdBy:       req.userId,
        },
      });
      await logActivity(prisma, {
        action:      p.type === 'customer' ? 'payment_received' : 'payment_sent',
        description: `${p.type === 'customer' ? 'Payment of' : 'Supplier payment of'} ₹${p.amount.toLocaleString('en-IN')} ${p.type === 'customer' ? 'received from' : 'sent to'} ${p.customer ?? 'party'} via ${p.method}`,
        entityType: 'payment',
        entityId:   p.id,
        userId:     req.userId,
        after:      p,
      });
    }

    res.status(201).json(p);
  } catch (err) {
    console.error('[payments POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const p = await prisma.payment.update({
      where: { id: req.params.id },
      data:  sanitize(req.body) as Parameters<typeof prisma.payment.update>[0]['data'],
    });
    res.json(p);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.payment.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

function sanitize(body: Record<string, unknown>) {
  const { createdAt, updatedAt, trip, ...rest } = body;
  return rest;
}

export default router;
