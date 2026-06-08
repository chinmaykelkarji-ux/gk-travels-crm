// ============================================================
// GK TRAVELS CRM — Analytics API
//
// All aggregations run server-side via Prisma groupBy + aggregate.
// No raw data dumps — only computed summaries are sent to the browser.
// ============================================================

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ── Date helpers ──────────────────────────────────────────────

function monthKey(monthsBack = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function buildDateFilter(from?: string, to?: string) {
  if (!from && !to) return {};
  const filter: Record<string, string> = {};
  if (from) filter.gte = from;
  if (to)   filter.lte = to;
  return filter;
}

// ══ GET /api/analytics/overview ═══════════════════════════════
// Executive KPI cards — totals across all trips + payments

router.get('/overview', async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const dateFilter = buildDateFilter(from, to);
    const createdFilter = Object.keys(dateFilter).length
      ? { createdDate: dateFilter }
      : {};

    const [
      trips,
      customerPayAgg,
      supplierPayAgg,
      pendingReceivables,
      pendingPayables,
      quotationPipeline,
      ledgerByType,
    ] = await Promise.all([
      // Trip counts + financial totals
      prisma.trip.aggregate({
        where: createdFilter,
        _count:  { id: true },
        _sum:    { paidAmount: true, grossMargin: true, totalAmount: true, supplierCost: true },
      }),
      // Total customer payments received
      prisma.payment.aggregate({
        where: { type: 'customer', status: 'received', ...(from || to ? { date: dateFilter } : {}) },
        _sum: { amount: true },
      }),
      // Total supplier payments made
      prisma.payment.aggregate({
        where: { type: 'supplier', status: 'paid', ...(from || to ? { date: dateFilter } : {}) },
        _sum: { amount: true },
      }),
      // Outstanding receivables (trips with balance > 0)
      prisma.trip.aggregate({
        where: { ...createdFilter, balanceDue: { gt: 0 }, status: { not: 'cancelled' } },
        _sum: { balanceDue: true },
        _count: { id: true },
      }),
      // Outstanding vendor payables
      prisma.vendorPayment.aggregate({
        where: { isPaid: false },
        _sum: { outstanding: true },
        _count: { id: true },
      }),
      // Quotation pipeline value
      prisma.quotation.aggregate({
        where: { status: { in: ['draft', 'sent'] } },
        _sum: { totalSelling: true, grossProfit: true },
        _count: { id: true },
      }),
      // Central ledger — drives cash inflow + GST liability (Phase 4: dashboard
      // must read these from FinancialTransaction, not re-derive them)
      prisma.financialTransaction.groupBy({
        by:   ['type'],
        _sum: { amount: true, gstAmount: true },
      }),
    ]);

    const ledgerSum = (type: string) => ledgerByType.find(g => g.type === type)?._sum;
    const cashInflow   = ledgerSum('PAYMENT_RECEIVED')?.amount ?? 0;
    const cashOutflow  = ledgerSum('PAYMENT_SENT')?.amount ?? 0;
    const gstOutput    = ledgerSum('RECEIVABLE')?.gstAmount ?? 0;
    const gstInput     = ledgerSum('PAYABLE')?.gstAmount ?? 0;
    const gstLiability = Math.round((gstOutput - gstInput) * 100) / 100;

    // Trip status breakdown
    const [activeTrips, completedTrips, cancelledTrips, draftTrips] = await Promise.all([
      prisma.trip.count({ where: { ...createdFilter, status: { in: ['confirmed', 'in_progress'] } } }),
      prisma.trip.count({ where: { ...createdFilter, status: 'completed' } }),
      prisma.trip.count({ where: { ...createdFilter, status: 'cancelled' } }),
      prisma.trip.count({ where: { ...createdFilter, status: 'draft' } }),
    ]);

    const totalRevenue   = customerPayAgg._sum.amount     ?? 0;
    const totalCost      = supplierPayAgg._sum.amount      ?? 0;
    const grossProfit    = totalRevenue - totalCost;
    const marginPct      = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0;
    const totalTripValue = trips._sum.totalAmount          ?? 0;
    const totalPaid      = trips._sum.paidAmount           ?? 0;

    res.json({
      totalRevenue,
      totalCost,
      grossProfit,
      marginPct,
      outstandingReceivables:  pendingReceivables._sum.balanceDue   ?? 0,
      overdueTrips:            pendingReceivables._count.id,
      outstandingPayables:     pendingPayables._sum.outstanding     ?? 0,
      overdueVendors:          pendingPayables._count.id,
      totalTripValue,
      totalPaid,
      tripCount:               trips._count.id,
      activeTrips,
      completedTrips,
      cancelledTrips,
      draftTrips,
      quotationPipeline:       quotationPipeline._sum.totalSelling  ?? 0,
      quotationCount:          quotationPipeline._count.id,
      cashInflow,
      cashOutflow,
      gstLiability,
    });
  } catch (err) {
    console.error('[analytics/overview]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ══ GET /api/analytics/monthly?months=12 ══════════════════════
// Month-by-month revenue, cost, profit, trip count trend

router.get('/monthly', async (req, res) => {
  try {
    const months = Math.min(parseInt(String(req.query.months ?? '12'), 10), 36);

    const keys = Array.from({ length: months }, (_, i) => monthKey(months - 1 - i));

    const rows = await Promise.all(
      keys.map(async (mk) => {
        const [rec, sup, tripCount, newLeads] = await Promise.all([
          prisma.payment.aggregate({
            where: { type: 'customer', status: 'received', date: { startsWith: mk } },
            _sum:  { amount: true },
          }),
          prisma.payment.aggregate({
            where: { type: 'supplier', status: 'paid', date: { startsWith: mk } },
            _sum:  { amount: true },
          }),
          prisma.trip.count({ where: { createdDate: { startsWith: mk } } }),
          prisma.lead.count({ where: { createdDate: { startsWith: mk } } }),
        ]);
        const revenue = rec._sum.amount ?? 0;
        const cost    = sup._sum.amount ?? 0;
        return {
          month:   mk,
          revenue,
          cost,
          profit:  revenue - cost,
          margin:  revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : 0,
          trips:   tripCount,
          leads:   newLeads,
        };
      })
    );

    res.json(rows);
  } catch (err) {
    console.error('[analytics/monthly]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ══ GET /api/analytics/destinations?from&to&limit ══════════════

router.get('/destinations', async (req, res) => {
  try {
    const { from, to, limit = '20' } = req.query as { from?: string; to?: string; limit?: string };
    const createdFilter = from || to ? buildDateFilter(from, to) : {};

    const groups = await prisma.trip.groupBy({
      by:      ['destination'],
      where:   Object.keys(createdFilter).length ? { createdDate: createdFilter } : {},
      _count:  { id: true },
      _sum:    { paidAmount: true, grossMargin: true, balanceDue: true, totalAmount: true, supplierCost: true },
      orderBy: { _sum: { paidAmount: 'desc' } },
      take:    parseInt(limit, 10),
    });

    const rows = groups.map(g => {
      // Sum revenue/cost/profit independently from their own canonical fields
      // (Trip.paidAmount/supplierCost/grossMargin — set via finance.ts'
      // calcTripFinance) rather than back-deriving one from the others, which
      // previously masked drift between cached fields.
      const revenue = g._sum.paidAmount    ?? 0;
      const cost    = g._sum.supplierCost  ?? 0;
      const profit  = g._sum.grossMargin   ?? 0;
      return {
        destination: g.destination,
        tripCount:   g._count.id,
        revenue,
        cost,
        profit,
        balance:     g._sum.balanceDue ?? 0,
        marginPct:   revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0,
      };
    });

    res.json(rows);
  } catch (err) {
    console.error('[analytics/destinations]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ══ GET /api/analytics/vendors?from&to&limit ══════════════════

router.get('/vendors', async (req, res) => {
  try {
    const { from, to, limit = '20' } = req.query as { from?: string; to?: string; limit?: string };

    // Group vendor payments by vendorId + vendorName
    const groups = await prisma.vendorPayment.groupBy({
      by:      ['vendorId', 'vendorName'],
      _sum:    { totalCost: true, advancePaid: true, outstanding: true },
      _count:  { id: true },
      orderBy: { _sum: { totalCost: 'desc' } },
      take:    parseInt(limit, 10),
    });

    const rows = groups.map(g => ({
      vendorId:     g.vendorId,
      vendorName:   g.vendorName,
      totalSpend:   g._sum.totalCost    ?? 0,
      totalPaid:    g._sum.advancePaid  ?? 0,
      outstanding:  g._sum.outstanding  ?? 0,
      engagements:  g._count.id,
    }));

    res.json(rows);
  } catch (err) {
    console.error('[analytics/vendors]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ══ GET /api/analytics/trips?from&to ══════════════════════════
// Profitability ranking: top performers, loss-makers, by margin

router.get('/trips', async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const dateFilter = from || to ? buildDateFilter(from, to) : {};
    const where = Object.keys(dateFilter).length
      ? { createdDate: dateFilter, status: { not: 'cancelled' as const } }
      : { status: { not: 'cancelled' as const } };

    const allTrips = await prisma.trip.findMany({
      where,
      select: {
        id: true, customer: true, destination: true, status: true,
        paidAmount: true, grossMargin: true, marginPct: true,
        balanceDue: true, totalAmount: true, departure: true, createdDate: true,
      },
      orderBy: { grossMargin: 'desc' },
    });

    const mapped = allTrips.map(t => ({
      id:          t.id,
      customer:    t.customer,
      destination: t.destination,
      status:      t.status,
      revenue:     t.paidAmount    ?? 0,
      profit:      t.grossMargin   ?? 0,
      marginPct:   t.marginPct     ?? 0,
      balanceDue:  t.balanceDue    ?? 0,
      totalValue:  t.totalAmount   ?? 0,
      departure:   t.departure,
      createdDate: t.createdDate,
    }));

    res.json({
      byProfit:    mapped.slice(0, 10),
      lossMaking:  mapped.filter(t => t.profit < 0).slice(0, 10),
      byMargin:    [...mapped].sort((a, b) => b.marginPct - a.marginPct).slice(0, 10),
      bottomMargin: [...mapped].filter(t => t.profit >= 0).sort((a, b) => a.marginPct - b.marginPct).slice(0, 10),
    });
  } catch (err) {
    console.error('[analytics/trips]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ══ GET /api/analytics/customers?from&to&limit ══════════════════

router.get('/customers', async (req, res) => {
  try {
    const { from, to, limit = '20' } = req.query as { from?: string; to?: string; limit?: string };
    const dateFilter = from || to ? buildDateFilter(from, to) : {};
    const where = Object.keys(dateFilter).length ? { createdDate: dateFilter } : {};

    const groups = await prisma.trip.groupBy({
      by:      ['customer'],
      where,
      _count:  { id: true },
      _sum:    { paidAmount: true, grossMargin: true, totalAmount: true },
      orderBy: { _sum: { paidAmount: 'desc' } },
      take:    parseInt(limit, 10),
    });

    const rows = groups.map(g => ({
      customerName: g.customer,
      tripCount:    g._count.id,
      totalRevenue: g._sum.paidAmount  ?? 0,
      totalProfit:  g._sum.grossMargin ?? 0,
      totalValue:   g._sum.totalAmount ?? 0,
      avgTripValue: g._count.id > 0 ? Math.round((g._sum.totalAmount ?? 0) / g._count.id) : 0,
      isRepeat:     g._count.id > 1,
    }));

    res.json(rows);
  } catch (err) {
    console.error('[analytics/customers]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ══ GET /api/analytics/alerts ══════════════════════════════════
// Warning signals requiring attention

router.get('/alerts', async (req, res) => {
  try {
    const [
      negProfitTrips,
      overdueBalances,
      overdueVendors,
      lowMarginQuotes,
    ] = await Promise.all([
      // Trips with negative margin (loss-making)
      prisma.trip.findMany({
        where:   { grossMargin: { lt: 0 }, status: { notIn: ['cancelled', 'draft'] } },
        select:  { id: true, customer: true, destination: true, grossMargin: true, marginPct: true, paidAmount: true, status: true },
        orderBy: { grossMargin: 'asc' },
        take:    20,
      }),
      // Trips with outstanding balance (departed or completing soon)
      prisma.trip.findMany({
        where:   { balanceDue: { gt: 0 }, status: { notIn: ['cancelled', 'draft'] } },
        select:  { id: true, customer: true, destination: true, balanceDue: true, departure: true, status: true },
        orderBy: { balanceDue: 'desc' },
        take:    20,
      }),
      // Overdue vendor payments
      prisma.vendorPayment.groupBy({
        by:      ['vendorName'],
        where:   { isPaid: false, outstanding: { gt: 0 } },
        _sum:    { outstanding: true },
        _count:  { id: true },
        orderBy: { _sum: { outstanding: 'desc' } },
        take:    20,
      }),
      // Low-margin sent quotations (<15%)
      prisma.quotation.findMany({
        where:   { status: { in: ['draft', 'sent'] }, marginPct: { lt: 15 }, totalSelling: { gt: 0 } },
        select:  { id: true, quotationNumber: true, customerName: true, destination: true, marginPct: true, totalSelling: true, grossProfit: true },
        orderBy: { marginPct: 'asc' },
        take:    20,
      }),
    ]);

    res.json({
      negativeProfitTrips: negProfitTrips.map(t => ({
        id: t.id, customer: t.customer, destination: t.destination,
        profit: t.grossMargin ?? 0, marginPct: t.marginPct ?? 0,
        revenue: t.paidAmount ?? 0, status: t.status,
      })),
      overdueBalances: overdueBalances.map(t => ({
        id: t.id, customer: t.customer, destination: t.destination,
        balanceDue: t.balanceDue ?? 0, departure: t.departure, status: t.status,
      })),
      overdueVendors: overdueVendors.map(g => ({
        vendorName: g.vendorName,
        outstanding: g._sum.outstanding ?? 0,
        count: g._count.id,
      })),
      lowMarginQuotations: lowMarginQuotes.map(q => ({
        id: q.id, quotationNumber: q.quotationNumber,
        customer: q.customerName, destination: q.destination,
        marginPct: q.marginPct ?? 0, totalSelling: q.totalSelling ?? 0,
      })),
    });
  } catch (err) {
    console.error('[analytics/alerts]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ══ GET /api/analytics/yearly?years=3 ════════════════════════

router.get('/yearly', async (req, res) => {
  try {
    const years = Math.min(parseInt(String(req.query.years ?? '3'), 10), 5);
    const currentYear = new Date().getFullYear();
    const yearList = Array.from({ length: years }, (_, i) => currentYear - (years - 1 - i));

    const rows = await Promise.all(
      yearList.map(async (yr) => {
        const prefix = String(yr);
        const [rec, sup, tripCount] = await Promise.all([
          prisma.payment.aggregate({
            where: { type: 'customer', status: 'received', date: { startsWith: prefix } },
            _sum: { amount: true },
          }),
          prisma.payment.aggregate({
            where: { type: 'supplier', status: 'paid', date: { startsWith: prefix } },
            _sum: { amount: true },
          }),
          prisma.trip.count({ where: { createdDate: { startsWith: prefix } } }),
        ]);
        const revenue = rec._sum.amount ?? 0;
        const cost    = sup._sum.amount ?? 0;
        return { year: yr, revenue, cost, profit: revenue - cost, trips: tripCount };
      })
    );

    // Attach YoY growth %
    const withGrowth = rows.map((r, i) => {
      const prev   = rows[i - 1];
      const growth = prev && prev.revenue > 0
        ? Math.round(((r.revenue - prev.revenue) / prev.revenue) * 1000) / 10
        : null;
      return { ...r, revenueGrowth: growth };
    });

    res.json(withGrowth);
  } catch (err) {
    console.error('[analytics/yearly]', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
