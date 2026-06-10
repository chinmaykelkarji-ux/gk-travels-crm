import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { createCreditNote, cancelCreditNote, type CreateCreditNoteInput } from '../services/invoiceService.js';

const router = Router();
router.use(requireAuth);

const include = { items: { orderBy: { sortOrder: 'asc' as const } } };

// ── List ──────────────────────────────────────────────────────

router.get('/', async (_req, res) => {
  try {
    res.json(await prisma.creditNote.findMany({ orderBy: { createdAt: 'desc' }, include }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Single ────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const cn = await prisma.creditNote.findUnique({ where: { id: req.params.id }, include });
    if (!cn) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(cn);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Create ────────────────────────────────────────────────────

router.post('/', async (req: AuthRequest, res) => {
  try {
    const input = { ...(req.body as CreateCreditNoteInput), createdBy: req.userId };
    const cn = await createCreditNote(input);
    res.status(201).json(cn);
  } catch (err) {
    console.error('[creditNotes POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Cancel ────────────────────────────────────────────────────

router.post('/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const cn = await cancelCreditNote(req.params.id as string, req.userId);
    res.json(cn);
  } catch (err) {
    console.error('[creditNotes cancel]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
