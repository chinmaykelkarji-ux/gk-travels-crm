import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { createDebitNote, cancelDebitNote, type CreateDebitNoteInput } from '../services/invoiceService.js';

const router = Router();
router.use(requireAuth);

const include = { items: { orderBy: { sortOrder: 'asc' as const } } };

// ── List ──────────────────────────────────────────────────────

router.get('/', async (_req, res) => {
  try {
    res.json(await prisma.debitNote.findMany({ orderBy: { createdAt: 'desc' }, include }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Single ────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const dn = await prisma.debitNote.findUnique({ where: { id: req.params.id }, include });
    if (!dn) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(dn);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Create ────────────────────────────────────────────────────

router.post('/', async (req: AuthRequest, res) => {
  try {
    const input = { ...(req.body as CreateDebitNoteInput), createdBy: req.userId };
    const dn = await createDebitNote(input);
    res.status(201).json(dn);
  } catch (err) {
    console.error('[debitNotes POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Cancel ────────────────────────────────────────────────────

router.post('/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const dn = await cancelDebitNote(req.params.id as string, req.userId);
    res.json(dn);
  } catch (err) {
    console.error('[debitNotes cancel]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
