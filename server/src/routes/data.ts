// GET /api/data/all — bulk-load everything for the Zustand store
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/all', requireAuth, async (_req, res) => {
  try {
    const [trips, leads, customers, passengers, bookings, allPayments, tasks, activityLog, reminders, vendors, vendorPayments, quotations, itineraries, vouchers, receivables, communications] =
      await Promise.all([
        prisma.trip.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.lead.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.customer.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.passenger.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.booking.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.payment.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.task.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
        prisma.reminder.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.vendor.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.vendorPayment.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.quotation.findMany({
          orderBy: { createdAt: 'desc' },
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        }),
        prisma.itinerary.findMany({
          orderBy: { createdAt: 'desc' },
          include: { days: { orderBy: { sortOrder: 'asc' } } },
        }),
        prisma.voucher.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.receivable.findMany({
          orderBy: { createdAt: 'desc' },
          include: { entries: { orderBy: { createdAt: 'desc' } } },
        }),
        prisma.communication.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
      ]);

    res.json({
      trips,
      leads,
      customers,
      passengers,
      bookings,
      tasks,
      reminders,
      vendors,
      vendorPayments,
      quotations,
      itineraries,
      vouchers,
      receivables,
      communications,
      activityLog: activityLog.map(a => ({
        ...a,
        date:      a.date,
        timestamp: a.timestamp,
      })),
      payments: {
        customerPayments: allPayments.filter(p => p.type === 'customer'),
        supplierPayments: allPayments.filter(p => p.type === 'supplier'),
      },
    });
  } catch (err) {
    console.error('[data/all]', err);
    res.status(500).json({ error: 'Failed to load data' });
  }
});

export default router;
