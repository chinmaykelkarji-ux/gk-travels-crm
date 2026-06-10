import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import {
  createInvoice,
  updateInvoice,
  cancelInvoice,
  deleteInvoice,
  type CreateInvoiceInput,
  type UpdateInvoiceInput,
} from '../services/invoiceService.js';

const router = Router();
router.use(requireAuth);

const include = { items: { orderBy: { sortOrder: 'asc' as const } } };

// ── List ──────────────────────────────────────────────────────

router.get('/', async (_req, res) => {
  try {
    res.json(await prisma.invoice.findMany({ orderBy: { createdAt: 'desc' }, include }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Eligible bookings/trips for a customer (not yet invoiced) ──

router.get('/eligible/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    const [bookings, trips] = await Promise.all([
      prisma.booking.findMany({
        where: {
          customerId,
          invoiceId: null,
          status: { in: ['confirmed', 'issued', 'approved', 'submitted'] },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.trip.findMany({
        where: {
          customerId,
          invoiceId: null,
          status: { in: ['confirmed', 'in_progress', 'completed'] },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({ bookings, trips });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Single ────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const inv = await prisma.invoice.findUnique({ where: { id: req.params.id }, include });
    if (!inv) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(inv);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Create ────────────────────────────────────────────────────

router.post('/', async (req: AuthRequest, res) => {
  try {
    const input = { ...(req.body as CreateInvoiceInput), createdBy: req.userId };
    const invoice = await createInvoice(input);
    res.status(201).json(invoice);
  } catch (err) {
    console.error('[invoices POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Update ────────────────────────────────────────────────────

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const input = { ...(req.body as UpdateInvoiceInput), updatedBy: req.userId };
    const invoice = await updateInvoice(req.params.id as string, input);
    res.json(invoice);
  } catch (err) {
    console.error('[invoices PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Cancel ────────────────────────────────────────────────────

router.post('/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const { reason } = req.body as { reason: string };
    if (!reason) { res.status(400).json({ error: 'Cancellation reason is required' }); return; }
    const invoice = await cancelInvoice(req.params.id as string, reason, req.userId);
    res.json(invoice);
  } catch (err) {
    console.error('[invoices cancel]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Delete ────────────────────────────────────────────────────

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    await deleteInvoice(req.params.id as string, req.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[invoices DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
