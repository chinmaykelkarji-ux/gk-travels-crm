// GET /api/data/all — bulk-load the Zustand store for the current user.
//
// SECURITY (docs/travelos/01-audit.md E1): this endpoint used to return every
// table to every authenticated role, which bypassed all per-route permission
// checks. It now returns only the slices the caller's role may read, and
// redacts commercial / bank columns inside the slices it does return.
// Slices the role may not read come back as empty arrays so the store keeps
// its shape.
//
// This endpoint is scheduled for removal once every module reads through its
// own paginated v2 endpoint (docs/travelos/03-migration-and-roadmap.md K.2).
import { Router } from 'express';
import type { Role as UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { hasPermission } from '../lib/permissions.js';
import {
  redactTrip, redactBooking, redactVendor, redactCompanySettings, redactActivity,
} from '../lib/redact.js';
import { getOrCreateCompanySettings } from '../services/invoiceService.js';

const router = Router();

const EMPTY: never[] = [];

router.get('/all', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = req.userRole as UserRole;
    const can  = (permission: string) => hasPermission(role, permission);

    const finance   = can('finance:read');
    const trips     = can('trips:read');
    const customers = can('customers:read');

    const [
      tripRows, leads, customerRows, passengers, bookingRows, allPayments, tasks, activityRows,
      reminders, vendorRows, vendorPayments, quotations, itineraries, vouchers, receivables,
      communications, invoices, creditNotes, debitNotes, companySettings,
    ] = await Promise.all([
      trips     ? prisma.trip.findMany({ orderBy: { createdAt: 'desc' } })      : EMPTY,
      can('enquiries:read') ? prisma.lead.findMany({ orderBy: { createdAt: 'desc' } }) : EMPTY,
      customers ? prisma.customer.findMany({ orderBy: { createdAt: 'desc' } })  : EMPTY,
      customers ? prisma.passenger.findMany({ orderBy: { createdAt: 'desc' } }) : EMPTY,
      can('bookings:read') ? prisma.booking.findMany({ orderBy: { createdAt: 'desc' } }) : EMPTY,
      finance   ? prisma.payment.findMany({ orderBy: { createdAt: 'desc' } })   : EMPTY,
      can('tasks:read') ? prisma.task.findMany({ orderBy: { createdAt: 'desc' } }) : EMPTY,
      prisma.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
      prisma.reminder.findMany({ orderBy: { createdAt: 'desc' } }),
      (can('suppliers:read') || finance) ? prisma.vendor.findMany({ orderBy: { createdAt: 'desc' } }) : EMPTY,
      finance   ? prisma.vendorPayment.findMany({ orderBy: { createdAt: 'desc' } }) : EMPTY,
      can('sales-quotes:read')
        ? prisma.quotation.findMany({ orderBy: { createdAt: 'desc' }, include: { items: { orderBy: { sortOrder: 'asc' } } } })
        : EMPTY,
      trips ? prisma.itinerary.findMany({ orderBy: { createdAt: 'desc' }, include: { days: { orderBy: { sortOrder: 'asc' } } } }) : EMPTY,
      trips ? prisma.voucher.findMany({ orderBy: { createdAt: 'desc' } }) : EMPTY,
      finance
        ? prisma.receivable.findMany({ orderBy: { createdAt: 'desc' }, include: { entries: { orderBy: { createdAt: 'desc' } } } })
        : EMPTY,
      prisma.communication.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
      finance ? prisma.invoice.findMany({ orderBy: { createdAt: 'desc' }, include: { items: { orderBy: { sortOrder: 'asc' } } } }) : EMPTY,
      finance ? prisma.creditNote.findMany({ orderBy: { createdAt: 'desc' }, include: { items: { orderBy: { sortOrder: 'asc' } } } }) : EMPTY,
      finance ? prisma.debitNote.findMany({ orderBy: { createdAt: 'desc' }, include: { items: { orderBy: { sortOrder: 'asc' } } } }) : EMPTY,
      getOrCreateCompanySettings(),
    ]);

    res.json({
      trips:           tripRows.map(t => redactTrip(t, role)),
      leads,
      customers:       customerRows,
      passengers,
      bookings:        bookingRows.map(b => redactBooking(b, role)),
      tasks,
      reminders,
      vendors:         vendorRows.map(v => redactVendor(v, role)),
      vendorPayments,
      quotations,
      itineraries,
      vouchers,
      receivables,
      communications,
      invoices,
      creditNotes,
      debitNotes,
      companySettings: redactCompanySettings(companySettings, role),
      activityLog:     activityRows.map(a => redactActivity(a, role)),
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
