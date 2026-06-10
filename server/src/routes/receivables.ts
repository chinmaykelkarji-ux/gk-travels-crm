import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const include = { entries: { orderBy: { createdAt: 'desc' as const } } };

// ── Helper ────────────────────────────────────────────────────
// Receivable entries are managed through their own sub-resource routes —
// strip them (and server-managed fields) from the receivable upsert payload.

function strip(body: Record<string, unknown>) {
  const { createdAt, updatedAt, entries, ...rest } = body;
  return rest;
}

// ── List ──────────────────────────────────────────────────────

router.get('/', async (_req, res) => {
  try {
    res.json(await prisma.receivable.findMany({ orderBy: { createdAt: 'desc' }, include }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Customer Ledger — dynamic aggregation view ──────────────────
// Reads from the `customer_ledger_balances` SQL view (see migration
// 20260610000000_customer_ledger_view). The view recomputes invoiced /
// received / balance totals live from receivables + receivable_entries on
// every query — there is no cached balance to go stale, so edits, deletes,
// and zero-transaction customers are always reflected correctly.

interface CustomerLedgerRow {
  customerId:       string;
  customerName:     string;
  totalInvoiced:    number;
  totalReceived:    number;
  balanceDue:       number;
  openInvoiceCount: number;
  lastPaymentDate:  string | null;
}

router.get('/customer-ledger', async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw<CustomerLedgerRow[]>`
      SELECT * FROM "customer_ledger_balances" ORDER BY "balanceDue" DESC
    `;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get('/customer-ledger/:customerId', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw<CustomerLedgerRow[]>`
      SELECT * FROM "customer_ledger_balances" WHERE "customerId" = ${req.params.customerId}
    `;
    res.json(rows[0] ?? null);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Create ────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const data = strip(req.body as Record<string, unknown>);
    const r    = await prisma.receivable.upsert({
      where:  { id: String(data.id) },
      update: data as Parameters<typeof prisma.receivable.update>[0]['data'],
      create: data as Parameters<typeof prisma.receivable.create>[0]['data'],
      include,
    });
    res.status(201).json(r);
  } catch (err) {
    console.error('[receivables POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Update ────────────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const data = strip(req.body as Record<string, unknown>);
    const r = await prisma.receivable.update({
      where:   { id: req.params.id },
      data:    data as Parameters<typeof prisma.receivable.update>[0]['data'],
      include,
    });
    res.json(r);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Delete ────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    await prisma.receivable.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Entries — record / remove payments against a receivable ──

router.post('/:id/entries', async (req, res) => {
  try {
    const { id, receivableId, createdAt, ...data } = req.body as Record<string, unknown>;
    const entry = await prisma.receivableEntry.create({
      data: {
        ...data,
        id: String(id),
        receivableId: req.params.id,
      } as Parameters<typeof prisma.receivableEntry.create>[0]['data'],
    });
    res.status(201).json(entry);
  } catch (err) {
    console.error('[receivables entries POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id/entries/:entryId', async (req, res) => {
  try {
    const { id, receivableId, createdAt, ...data } = req.body as Record<string, unknown>;
    const entry = await prisma.receivableEntry.update({
      where: { id: req.params.entryId },
      data:  data as Parameters<typeof prisma.receivableEntry.update>[0]['data'],
    });
    res.json(entry);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.delete('/:id/entries/:entryId', async (req, res) => {
  try {
    await prisma.receivableEntry.delete({ where: { id: req.params.entryId } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;
