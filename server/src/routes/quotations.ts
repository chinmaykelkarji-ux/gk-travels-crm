import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { calcGst }                        from '../../../src/shared/utils/finance.js';
import { generateTasksFromCategories }    from '../../../src/shared/utils/taskEngine.js';
import { nextTaskId }                      from '../../../src/shared/utils/id.js';
import { createReceivable }                from '../services/financeService.js';
import { logActivity }                     from '../services/activityService.js';

const router = Router();
router.use(requireAuth);

// ── Calculation helpers ───────────────────────────────────────

function calcItem(i: Record<string, unknown>) {
  const qty     = Number(i.quantity     ?? 1);
  const cost    = Number(i.costPrice    ?? 0);
  const selling = Number(i.sellingPrice ?? 0);
  const totalCost    = Math.round(cost    * qty * 100) / 100;
  const totalSelling = Math.round(selling * qty * 100) / 100;
  const grossProfit  = Math.round((totalSelling - totalCost)         * 100) / 100;
  const marginPct    = totalSelling > 0
    ? Math.round((grossProfit / totalSelling) * 10000) / 100
    : 0;
  return { ...i, qty: undefined, quantity: qty, totalCost, totalSelling, grossProfit, marginPct };
}

function calcTotals(items: Record<string, unknown>[]) {
  const totalCost    = items.reduce((s, i) => s + Number(i.totalCost    ?? 0), 0);
  const totalSelling = items.reduce((s, i) => s + Number(i.totalSelling ?? 0), 0);
  const grossProfit  = totalSelling - totalCost;
  const marginPct    = totalSelling > 0
    ? Math.round((grossProfit / totalSelling) * 10000) / 100
    : 0;
  return { totalCost, totalSelling, grossProfit, marginPct };
}

// ── List ──────────────────────────────────────────────────────

router.get('/', async (_req, res) => {
  try {
    const qs = await prisma.quotation.findMany({
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    res.json(qs);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Single ────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const q = await prisma.quotation.findUnique({
      where:   { id: req.params.id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!q) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(q);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Create ────────────────────────────────────────────────────

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { items = [], ...body } = req.body as { items?: Record<string, unknown>[]; [k: string]: unknown };

    const calcedItems = (items as Record<string, unknown>[]).map((it, idx) => calcItem({ ...it, sortOrder: idx }));
    const totals      = calcTotals(calcedItems);

    const { updatedAt, createdAt, ...qData } = body;
    const q = await prisma.quotation.create({
      data: {
        ...(qData as Parameters<typeof prisma.quotation.create>[0]['data']),
        ...totals,
        items: {
          create: calcedItems.map((entry) => {
            const { id, quotationId, createdAt, updatedAt, ...it } = entry as Record<string, unknown>;
            return it as Parameters<typeof prisma.quotationItem.create>[0]['data'];
          }),
        },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    await logActivity(prisma, {
      type:       'quotation_created',
      message:    `Quotation ${q.id} created for ${q.customerName} (₹${q.totalSelling.toLocaleString('en-IN')})`,
      entityType: 'quotation',
      entityId:   q.id,
      userId:     req.userId,
      after:      q,
    });

    res.status(201).json(q);
  } catch (err) {
    console.error('[quotations POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Update (replaces items) ───────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const { items = [], ...body } = req.body as { items?: Record<string, unknown>[]; [k: string]: unknown };
    const calcedItems = (items as Record<string, unknown>[]).map((it, idx) => calcItem({ ...it, sortOrder: idx }));
    const totals      = calcTotals(calcedItems);

    const { updatedAt, createdAt, id, ...qData } = body;

    const q = await prisma.$transaction(async (tx) => {
      await tx.quotationItem.deleteMany({ where: { quotationId: req.params.id } });
      return tx.quotation.update({
        where: { id: req.params.id },
        data:  {
          ...(qData as Parameters<typeof prisma.quotation.update>[0]['data']),
          ...totals,
          items: {
            create: calcedItems.map((entry) => {
              const { id, quotationId, createdAt, updatedAt, ...it } = entry as Record<string, unknown>;
              return it as Parameters<typeof prisma.quotationItem.create>[0]['data'];
            }),
          },
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });
    res.json(q);
  } catch (err) {
    console.error('[quotations PUT]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Delete ────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    await prisma.quotationItem.deleteMany({ where: { quotationId: req.params.id } });
    await prisma.quotation.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[quotations DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Status update ─────────────────────────────────────────────

router.put('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { status } = req.body as { status: string };
    const now = new Date().toISOString().split('T')[0];

    const data: Record<string, unknown> = { status };
    if (status === 'sent')     data.sentAt     = now;
    if (status === 'accepted') data.acceptedAt = now;
    if (status === 'rejected') data.rejectedAt = now;

    const q = await prisma.quotation.update({
      where:   { id: req.params.id as string },
      data:    data as Parameters<typeof prisma.quotation.update>[0]['data'],
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    await logActivity(prisma, {
      type:       'quotation_status_changed',
      message:    `Quotation ${q.id} marked ${status} (${q.customerName})`,
      entityType: 'quotation',
      entityId:   q.id,
      userId:     req.userId,
      after:      { status },
    });

    res.json(q);
  } catch (err) {
    console.error('[quotations status]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Duplicate ─────────────────────────────────────────────────

router.post('/:id/duplicate', async (req, res) => {
  try {
    const src = await prisma.quotation.findUnique({
      where:   { id: req.params.id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!src) { res.status(404).json({ error: 'Not found' }); return; }

    // Build new ID from all existing quotation IDs
    const existing = await prisma.quotation.findMany({ select: { id: true } });
    const year = new Date().getFullYear();
    const seq  = existing.reduce((max, q) => {
      const n = parseInt((q.id || '').split('-')[2] ?? '0', 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0) + 1;
    const newId = `Q-${year}-${String(seq).padStart(4, '0')}`;

    const { id, quotationNumber, status, sentAt, acceptedAt, rejectedAt,
            convertedTripId, convertedAt, createdAt, updatedAt,
            items, ...rest } = src;

    const q = await prisma.quotation.create({
      data: {
        ...(rest as Parameters<typeof prisma.quotation.create>[0]['data']),
        id:              newId,
        quotationNumber: newId,
        status:          'draft',
        createdDate:     new Date().toISOString().split('T')[0],
        items: {
          create: items.map(({ id: _id, quotationId: _qid, createdAt: _ca, updatedAt: _ua, ...it }) =>
            it as Parameters<typeof prisma.quotationItem.create>[0]['data']
          ),
        },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    res.status(201).json(q);
  } catch (err) {
    console.error('[quotations duplicate]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Convert to Trip ───────────────────────────────────────────

router.post('/:id/convert-trip', async (req, res) => {
  try {
    const q = await prisma.quotation.findUnique({
      where:   { id: req.params.id },
      include: { items: true },
    });
    if (!q) { res.status(404).json({ error: 'Not found' }); return; }
    if (q.status !== 'accepted') {
      res.status(400).json({ error: 'Only accepted quotations can be converted' });
      return;
    }
    if (q.convertedTripId) {
      res.status(400).json({ error: `Already converted to trip ${q.convertedTripId}` });
      return;
    }

    // Generate trip ID
    const existingTrips = await prisma.trip.findMany({ select: { id: true } });
    const year = new Date().getFullYear();
    const seq  = existingTrips.reduce((max, t) => {
      const n = parseInt((t.id || '').split('-')[2] ?? '0', 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0) + 1;
    const tripId = `GK-${year}-${String(seq).padStart(4, '0')}`;

    const today = new Date().toISOString().split('T')[0];

    const totalAmount = q.totalSelling > 0 ? q.totalSelling : null;
    const gst = totalAmount !== null
      ? calcGst(totalAmount, q.gstRate, q.gstMode)
      : { taxableAmount: 0, gstAmount: 0, totalPayable: null as number | null };

    // Auto-generate operational tasks from the quotation's item categories
    // (e.g. flight → "Book flight tickets", visa → "Collect visa documents")
    const categories   = [...new Set(q.items.map(i => i.category))];
    const generated    = generateTasksFromCategories({
      categories,
      tripId:     tripId,
      customerId: q.customerId,
      departure:  q.startDate,
    });
    const idPool   = (await prisma.task.findMany({ select: { id: true } })).map(t => t.id);
    const taskRows = generated.map(t => {
      const id = nextTaskId(idPool);
      idPool.push(id);
      return { id, ...t };
    });

    // Create trip + tasks + mark quotation converted + raise the receivable
    // + post to the activity feed — all atomically (Phase 1/2/5 automation:
    // a converted quotation must immediately reflect in finance & activity).
    const { trip, updated } = await prisma.$transaction(async (tx) => {
      const trip = await tx.trip.create({
        data: {
          id:            tripId,
          customer:      q.customerName,
          phone:         q.customerPhone ?? '',
          email:         q.customerEmail ?? undefined,
          customerId:    q.customerId    ?? undefined,
          destination:   q.destination,
          type:          'Leisure',
          pax:           q.pax,
          departure:     q.startDate     ?? undefined,
          returnDate:    q.endDate       ?? undefined,
          status:        'confirmed',
          totalAmount:   totalAmount     ?? undefined,
          totalPayable:  gst.totalPayable ?? undefined,
          gstRate:       q.gstRate,
          gstMode:       q.gstMode,
          gstAmount:     gst.gstAmount,
          taxableAmount: gst.taxableAmount,
          notes:         q.notes         ?? '',
          createdDate:   today,
          sourceLeadId:  undefined,
          timeline:      [{
            id:    `tl-${Date.now()}`,
            date:  today,
            event: `Trip created from Quotation ${q.id}`,
            type:  'system',
          }],
        },
      });

      await tx.task.createMany({ data: taskRows });

      const updated = await tx.quotation.update({
        where:   { id: q.id },
        data:    { convertedTripId: tripId, convertedAt: today },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });

      if (gst.totalPayable && gst.totalPayable > 0) {
        await createReceivable({
          sourceType:    'quotation',
          sourceId:      q.id,
          tripId:        trip.id,
          customerId:    trip.customerId,
          customerName:  trip.customer,
          amount:        gst.totalPayable,
          gstAmount:     gst.gstAmount,
          taxableAmount: gst.taxableAmount,
          dueDate:       trip.departure ?? undefined,
          description:   `Trip ${trip.id} — converted from Quotation ${q.id}`,
          createdBy:     req.userId,
        }, tx);
      }

      // Auto-create follow-up reminders alongside the trip/tasks/receivable —
      // same automation moment, mirroring the task-generation step above.
      const reminderRows: Prisma.ReminderCreateManyInput[] = [];
      if (gst.totalPayable && gst.totalPayable > 0 && trip.departure) {
        reminderRows.push({
          tripId:   trip.id,
          type:     'balance_payment',
          priority: 'high',
          message:  `Follow up on payment for ${trip.customer} — ₹${gst.totalPayable.toLocaleString('en-IN')} due by ${trip.departure}`,
          dueDate:  trip.departure,
          sent:     false,
        });
      }
      if (trip.departure) {
        reminderRows.push({
          tripId:   trip.id,
          type:     'trip_prep',
          priority: 'medium',
          message:  `Prepare trip documents for ${trip.customer} — departing ${trip.departure} to ${trip.destination}`,
          dueDate:  trip.departure,
          sent:     false,
        });
      }
      if (reminderRows.length) {
        await tx.reminder.createMany({ data: reminderRows });
      }

      await logActivity(tx, {
        type:       'quotation_converted',
        message:    `Quotation ${q.id} converted to Trip ${trip.id} for ${trip.customer}`,
        entityType: 'quotation',
        entityId:   q.id,
        userId:     req.userId,
        before:     { status: q.status },
        after:      { convertedTripId: tripId, convertedAt: today },
      });

      return { trip, updated };
    });

    res.json({ quotation: updated, trip, tasksCreated: taskRows.length });
  } catch (err) {
    console.error('[quotations convert-trip]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Dashboard stats ───────────────────────────────────────────

router.get('/meta/stats', async (_req, res) => {
  try {
    const all = await prisma.quotation.findMany({ select: {
      status: true, totalSelling: true, grossProfit: true, createdAt: true,
    }});
    const sent     = all.filter(q => ['sent', 'accepted', 'rejected'].includes(q.status)).length;
    const accepted = all.filter(q => q.status === 'accepted').length;
    const pipeline = all.filter(q => ['draft', 'sent'].includes(q.status))
      .reduce((s, q) => s + (q.totalSelling ?? 0), 0);
    const potential = all.filter(q => ['draft', 'sent'].includes(q.status))
      .reduce((s, q) => s + (q.grossProfit ?? 0), 0);
    res.json({
      sent, accepted,
      acceptanceRate: sent > 0 ? Math.round((accepted / sent) * 100) : 0,
      pipeline,
      potentialProfit: potential,
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;
