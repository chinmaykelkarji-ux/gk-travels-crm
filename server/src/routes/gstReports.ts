import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';

const router = Router();
router.use(requireAuth);

function dateRange(req: { query: Record<string, unknown> }) {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to   = typeof req.query.to   === 'string' ? req.query.to   : undefined;
  const range: { gte?: string; lte?: string } = {};
  if (from) range.gte = from;
  if (to)   range.lte = to;
  return Object.keys(range).length ? range : undefined;
}

// ── Sales Register ───────────────────────────────────────────
// Invoice#, Date, Customer, HSN/SAC, Taxable Value, GST Value, Total Value

router.get('/sales-register', requirePermission('finance:read'), async (req, res) => {
  try {
    const dateFilter = dateRange(req);
    const invoices = await prisma.invoice.findMany({
      where: {
        status: 'ISSUED',
        ...(dateFilter ? { invoiceDate: dateFilter } : {}),
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ financialYear: 'asc' }, { sequenceNumber: 'asc' }],
    });

    const rows = invoices.map(inv => ({
      invoiceId:      inv.id,
      invoiceNumber:  inv.invoiceNumber,
      date:           inv.invoiceDate,
      customerName:   inv.customerName,
      customerGstin:  inv.customerGstin,
      placeOfSupply:  inv.placeOfSupply,
      gstType:        inv.gstType,
      hsnSac:         [...new Set(inv.items.map(i => i.hsnSac).filter(Boolean))].join(', '),
      taxableAmount:  inv.taxableAmount,
      cgstAmount:     inv.cgstAmount,
      sgstAmount:     inv.sgstAmount,
      igstAmount:     inv.igstAmount,
      totalGstAmount: inv.totalGstAmount,
      totalAmount:    inv.totalAmount,
    }));

    res.json(rows);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Credit Note Register ─────────────────────────────────────

router.get('/credit-notes', requirePermission('finance:read'), async (req, res) => {
  try {
    const dateFilter = dateRange(req);
    const notes = await prisma.creditNote.findMany({
      where: {
        status: 'ISSUED',
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      include: { invoice: { select: { invoiceNumber: true } } },
      orderBy: [{ financialYear: 'asc' }, { sequenceNumber: 'asc' }],
    });

    const rows = notes.map(cn => ({
      creditNoteId:     cn.id,
      creditNoteNumber: cn.creditNoteNumber,
      date:             cn.date,
      customerName:     cn.customerName,
      invoiceNumber:    cn.invoice?.invoiceNumber ?? null,
      reason:           cn.reason,
      taxableAmount:    cn.taxableAmount,
      cgstAmount:       cn.cgstAmount,
      sgstAmount:       cn.sgstAmount,
      igstAmount:       cn.igstAmount,
      totalGstAmount:   cn.totalGstAmount,
      totalAmount:      cn.totalAmount,
    }));

    res.json(rows);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Debit Note Register ──────────────────────────────────────

router.get('/debit-notes', requirePermission('finance:read'), async (req, res) => {
  try {
    const dateFilter = dateRange(req);
    const notes = await prisma.debitNote.findMany({
      where: {
        status: 'ISSUED',
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      include: { invoice: { select: { invoiceNumber: true } } },
      orderBy: [{ financialYear: 'asc' }, { sequenceNumber: 'asc' }],
    });

    const rows = notes.map(dn => ({
      debitNoteId:     dn.id,
      debitNoteNumber: dn.debitNoteNumber,
      date:            dn.date,
      customerName:    dn.customerName,
      invoiceNumber:   dn.invoice?.invoiceNumber ?? null,
      reason:          dn.reason,
      taxableAmount:   dn.taxableAmount,
      cgstAmount:      dn.cgstAmount,
      sgstAmount:      dn.sgstAmount,
      igstAmount:      dn.igstAmount,
      totalGstAmount:  dn.totalGstAmount,
      totalAmount:     dn.totalAmount,
    }));

    res.json(rows);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── GST Summary ───────────────────────────────────────────────
// Total Taxable Sales, Total CGST/SGST/IGST, Net GST Liability
// (Sales GST - Credit Note GST + Debit Note GST)

router.get('/summary', requirePermission('finance:read'), async (req, res) => {
  try {
    const dateFilter = dateRange(req);

    const [invoices, creditNotes, debitNotes] = await Promise.all([
      prisma.invoice.findMany({
        where: { status: 'ISSUED', ...(dateFilter ? { invoiceDate: dateFilter } : {}) },
        select: { taxableAmount: true, cgstAmount: true, sgstAmount: true, igstAmount: true, totalGstAmount: true, totalAmount: true },
      }),
      prisma.creditNote.findMany({
        where: { status: 'ISSUED', ...(dateFilter ? { date: dateFilter } : {}) },
        select: { taxableAmount: true, cgstAmount: true, sgstAmount: true, igstAmount: true, totalGstAmount: true, totalAmount: true },
      }),
      prisma.debitNote.findMany({
        where: { status: 'ISSUED', ...(dateFilter ? { date: dateFilter } : {}) },
        select: { taxableAmount: true, cgstAmount: true, sgstAmount: true, igstAmount: true, totalGstAmount: true, totalAmount: true },
      }),
    ]);

    const sum = (rows: { taxableAmount: number; cgstAmount: number; sgstAmount: number; igstAmount: number; totalGstAmount: number; totalAmount: number }[]) =>
      rows.reduce((acc, r) => ({
        taxableAmount:  acc.taxableAmount  + r.taxableAmount,
        cgstAmount:     acc.cgstAmount     + r.cgstAmount,
        sgstAmount:     acc.sgstAmount     + r.sgstAmount,
        igstAmount:     acc.igstAmount     + r.igstAmount,
        totalGstAmount: acc.totalGstAmount + r.totalGstAmount,
        totalAmount:    acc.totalAmount    + r.totalAmount,
      }), { taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalGstAmount: 0, totalAmount: 0 });

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const sales = sum(invoices);
    const cn    = sum(creditNotes);
    const dn    = sum(debitNotes);

    res.json({
      sales,
      creditNotes: cn,
      debitNotes:  dn,
      netTaxableSales: round2(sales.taxableAmount - cn.taxableAmount + dn.taxableAmount),
      netCgst:         round2(sales.cgstAmount    - cn.cgstAmount    + dn.cgstAmount),
      netSgst:         round2(sales.sgstAmount    - cn.sgstAmount    + dn.sgstAmount),
      netIgst:         round2(sales.igstAmount    - cn.igstAmount    + dn.igstAmount),
      netGstLiability: round2(sales.totalGstAmount - cn.totalGstAmount + dn.totalGstAmount),
      netSalesValue:   round2(sales.totalAmount    - cn.totalAmount    + dn.totalAmount),
      invoiceCount:    invoices.length,
      creditNoteCount: creditNotes.length,
      debitNoteCount:  debitNotes.length,
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;
