import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';
import { generateQuoteNumber } from '../services/quoteNumber.js';
import { nextTripId } from '../../../src/shared/utils/id.js';
import type { Customer, Enquiry, SalesQuote, SalesQuoteItem, Vendor } from '@prisma/client';

const router = Router();
router.use(requireAuth);

type ItemWithSupplier = SalesQuoteItem & { supplier: Vendor | null };
type QuoteWithRelations = SalesQuote & {
  customer:  Customer;
  enquiry:   Enquiry;
  lineItems: ItemWithSupplier[];
};

// ── Helpers ──────────────────────────────────────────────────

function toLineItemDTO(item: ItemWithSupplier) {
  return {
    id:           item.id,
    serviceType:  item.serviceType,
    description:  item.description,
    supplierId:   item.supplierId,
    supplierName: item.supplier?.name ?? null,
    costPrice:    Number(item.costPrice),
    markup:       Number(item.markup),
    sellPrice:    Number(item.sellPrice),
    quantity:     item.quantity,
    unit:         item.unit,
    details:      item.details,
    sortOrder:    item.sortOrder,
    lineTotal:    Math.round(Number(item.sellPrice) * item.quantity * 100) / 100,
  };
}

function toQuoteDTO(q: QuoteWithRelations) {
  return {
    id:              q.id,
    enquiryId:       q.enquiryId,
    quoteNumber:     q.quoteNumber,
    customerId:      q.customerId,
    customerName:    q.customer.name,
    customerPhone:   q.customer.phone,
    destination:     q.enquiry.destination,
    status:          q.status,
    validUntil:      q.validUntil.toISOString(),
    lineItems:       q.lineItems.map(toLineItemDTO),
    subtotal:        Number(q.subtotal),
    discountAmount:  Number(q.discountAmount),
    taxAmount:       Number(q.taxAmount),
    totalAmount:     Number(q.totalAmount),
    notes:           q.notes,
    termsConditions: q.termsConditions,
    sentAt:          q.sentAt?.toISOString() ?? null,
    viewedAt:        q.viewedAt?.toISOString() ?? null,
    convertedAt:     q.convertedAt?.toISOString() ?? null,
    convertedTripId: q.convertedTripId,
    createdAt:       q.createdAt.toISOString(),
    updatedAt:       q.updatedAt.toISOString(),
  };
}

const INCLUDE = {
  customer:  true,
  enquiry:   true,
  lineItems: { include: { supplier: true }, orderBy: { sortOrder: 'asc' as const } },
};

interface LineItemInput {
  serviceType: SalesQuoteItem['serviceType'];
  description: string;
  supplierId?: string | null;
  costPrice:   number;
  markup?:     number;
  quantity?:   number;
  unit?:       string;
  details?:    unknown;
}

function calcLineItem(item: LineItemInput, sortOrder: number) {
  const costPrice = Number(item.costPrice ?? 0);
  const markup    = Number(item.markup ?? 0);
  const quantity  = Number(item.quantity ?? 1);
  const sellPrice = Math.round((costPrice + markup) * 100) / 100;
  return {
    serviceType: item.serviceType,
    description: item.description,
    supplierId:  item.supplierId ?? null,
    costPrice,
    markup,
    sellPrice,
    quantity,
    unit:        item.unit ?? 'per person',
    // details is Json (unknown shape by design — varies by serviceType)
    details:     (item.details ?? {}) as object,
    sortOrder,
  };
}

function calcTotals(items: { sellPrice: number; quantity: number }[], discountAmount: number) {
  const subtotal    = Math.round(items.reduce((s, i) => s + i.sellPrice * i.quantity, 0) * 100) / 100;
  const taxAmount   = 0;
  const totalAmount = Math.round((subtotal - discountAmount + taxAmount) * 100) / 100;
  return { subtotal, taxAmount, totalAmount };
}

// ── List ──────────────────────────────────────────────────────

router.get('/', requirePermission('sales-quotes:read'), async (req, res) => {
  try {
    const { status, customerId, enquiryId } = req.query as Record<string, string | undefined>;
    const quotes = await prisma.salesQuote.findMany({
      where: {
        ...(status     ? { status: status as SalesQuote['status'] } : {}),
        ...(customerId ? { customerId } : {}),
        ...(enquiryId  ? { enquiryId } : {}),
      },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    res.json(quotes.map(toQuoteDTO));
  } catch (err) {
    console.error('[sales-quotes GET]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Single ────────────────────────────────────────────────────

router.get('/:id', requirePermission('sales-quotes:read'), async (req, res) => {
  try {
    const quote = await prisma.salesQuote.findUnique({ where: { id: req.params.id }, include: INCLUDE });
    if (!quote) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(toQuoteDTO(quote));
  } catch (err) {
    console.error('[sales-quotes GET /:id]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Create ────────────────────────────────────────────────────

router.post('/', requirePermission('sales-quotes:write'), async (req: AuthRequest, res) => {
  try {
    const body = req.body as {
      enquiryId: string;
      validUntil?: string;
      lineItems?: LineItemInput[];
      discountAmount?: number;
      notes?: string;
      termsConditions?: string;
    };

    if (!body.enquiryId) { res.status(400).json({ error: 'enquiryId is required' }); return; }

    const enquiry = await prisma.enquiry.findUnique({ where: { id: body.enquiryId } });
    if (!enquiry) { res.status(400).json({ error: 'Enquiry not found' }); return; }

    const discountAmount = Number(body.discountAmount ?? 0);
    const items   = (body.lineItems ?? []).map((it, idx) => calcLineItem(it, idx));
    const totals  = calcTotals(items, discountAmount);
    const quoteNumber = await generateQuoteNumber();

    const validUntil = body.validUntil
      ? new Date(body.validUntil)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const quote = await prisma.$transaction(async (tx) => {
      const created = await tx.salesQuote.create({
        data: {
          enquiryId:       body.enquiryId,
          quoteNumber,
          customerId:      enquiry.customerId,
          validUntil,
          subtotal:        totals.subtotal,
          discountAmount,
          taxAmount:       totals.taxAmount,
          totalAmount:     totals.totalAmount,
          notes:           body.notes ?? null,
          termsConditions: body.termsConditions ?? process.env.DEFAULT_TERMS ?? null,
          lineItems: { create: items },
        },
        include: INCLUDE,
      });

      if (enquiry.status === 'NEW' || enquiry.status === 'IN_PROGRESS') {
        await tx.enquiry.update({ where: { id: enquiry.id }, data: { status: 'QUOTED' } });
      }

      return created;
    });

    res.status(201).json(toQuoteDTO(quote));
  } catch (err) {
    console.error('[sales-quotes POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Update ────────────────────────────────────────────────────

router.put('/:id', requirePermission('sales-quotes:write'), async (req, res) => {
  try {
    const existing = await prisma.salesQuote.findUnique({ where: { id: req.params.id }, include: INCLUDE });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }

    const body = req.body as {
      status?: SalesQuote['status'];
      lineItems?: LineItemInput[];
      discountAmount?: number;
      notes?: string;
      termsConditions?: string;
      validUntil?: string;
    };

    if (body.lineItems && existing.status !== 'DRAFT' && existing.status !== 'NEGOTIATING') {
      res.status(400).json({ error: 'Line items can only be edited while the quote is DRAFT or NEGOTIATING' });
      return;
    }

    const discountAmount = body.discountAmount !== undefined ? Number(body.discountAmount) : Number(existing.discountAmount);

    const quote = await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};

      if (body.lineItems) {
        await tx.salesQuoteItem.deleteMany({ where: { salesQuoteId: existing.id } });
        const items  = body.lineItems.map((it, idx) => calcLineItem(it, idx));
        const totals = calcTotals(items, discountAmount);
        data.subtotal    = totals.subtotal;
        data.taxAmount   = totals.taxAmount;
        data.totalAmount = totals.totalAmount;
        data.discountAmount = discountAmount;
        await tx.salesQuoteItem.createMany({
          data: items.map(it => ({ ...it, salesQuoteId: existing.id })),
        });
      } else if (body.discountAmount !== undefined) {
        const totals = calcTotals(
          existing.lineItems.map(i => ({ sellPrice: Number(i.sellPrice), quantity: i.quantity })),
          discountAmount,
        );
        data.subtotal       = totals.subtotal;
        data.taxAmount      = totals.taxAmount;
        data.totalAmount    = totals.totalAmount;
        data.discountAmount = discountAmount;
      }

      if (body.notes !== undefined)           data.notes = body.notes;
      if (body.termsConditions !== undefined) data.termsConditions = body.termsConditions;
      if (body.validUntil !== undefined)      data.validUntil = new Date(body.validUntil);

      if (body.status && body.status !== existing.status) {
        data.status = body.status;
        if (body.status === 'SENT')   data.sentAt   = new Date();
        if (body.status === 'VIEWED') data.viewedAt = new Date();

        if (body.status === 'SENT') {
          await tx.enquiry.update({ where: { id: existing.enquiryId }, data: { status: 'QUOTED' } });
        } else if (body.status === 'ACCEPTED') {
          await tx.enquiry.update({ where: { id: existing.enquiryId }, data: { status: 'WON' } });
        } else if (body.status === 'REJECTED') {
          await tx.enquiry.update({ where: { id: existing.enquiryId }, data: { status: 'NEGOTIATING' } });
        }
      }

      return tx.salesQuote.update({ where: { id: existing.id }, data, include: INCLUDE });
    });

    res.json(toQuoteDTO(quote));
  } catch (err) {
    console.error('[sales-quotes PUT]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Convert to Booking ───────────────────────────────────────

router.post('/:id/convert', requirePermission('sales-quotes:write'), async (req: AuthRequest, res) => {
  try {
    const quote = await prisma.salesQuote.findUnique({ where: { id: req.params.id }, include: INCLUDE });
    if (!quote) { res.status(404).json({ error: 'Not found' }); return; }
    if (quote.status !== 'ACCEPTED') {
      res.status(400).json({ error: 'Only ACCEPTED quotes can be converted to a booking' });
      return;
    }
    if (quote.convertedTripId) {
      res.status(400).json({ error: 'This quote has already been converted to a booking' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingIds = (await tx.trip.findMany({ select: { id: true } })).map(t => t.id);
      const tripId = nextTripId(existingIds);

      const supplierCost = Math.round(
        quote.lineItems.reduce((s, i) => s + Number(i.costPrice) * i.quantity, 0) * 100,
      ) / 100;
      const totalAmount = Number(quote.totalAmount);
      const grossMargin = Math.round((totalAmount - supplierCost) * 100) / 100;
      const marginPct   = totalAmount > 0 ? Math.round((grossMargin / totalAmount) * 10000) / 100 : 0;

      const trip = await tx.trip.create({
        data: {
          id:           tripId,
          customer:     quote.customer.name,
          phone:        quote.customer.phone,
          email:        quote.customer.email,
          customerId:   quote.customer.id,
          destination:  quote.enquiry.destination,
          pax:          quote.enquiry.pax,
          departure:    quote.enquiry.departureDate?.toISOString().split('T')[0] ?? null,
          returnDate:   quote.enquiry.returnDate?.toISOString().split('T')[0] ?? null,
          status:       'confirmed',
          totalAmount,
          totalPayable: totalAmount,
          paidAmount:   0,
          balanceDue:   totalAmount,
          supplierCost,
          grossMargin,
          marginPct,
          notes:        `Converted from quote ${quote.quoteNumber}`,
          createdDate:  new Date().toISOString().split('T')[0],
        },
      });

      for (const item of quote.lineItems) {
        await tx.tripService.create({
          data: {
            tripId:      trip.id,
            type:        item.serviceType,
            status:      'REQUESTED',
            serviceDate: quote.enquiry.departureDate ?? new Date(),
            supplierId:  item.supplierId,
            costPrice:   Number(item.costPrice) * item.quantity,
            sellPrice:   Number(item.sellPrice) * item.quantity,
            details:     item.details as object,
            notes:       item.description,
          },
        });
      }

      await tx.salesQuote.update({
        where: { id: quote.id },
        data:  { convertedAt: new Date(), convertedTripId: trip.id },
      });

      await tx.enquiry.update({ where: { id: quote.enquiryId }, data: { status: 'WON' } });

      await tx.outboxEvent.create({
        data: {
          eventType:      'BOOKING_CONFIRMED',
          payload:        { tripId: trip.id, salesQuoteId: quote.id },
          idempotencyKey: `booking-confirmed:${quote.id}`,
        },
      });

      return trip;
    });

    res.status(201).json({ tripId: result.id });
  } catch (err) {
    console.error('[sales-quotes POST /:id/convert]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Duplicate ─────────────────────────────────────────────────

router.post('/:id/duplicate', requirePermission('sales-quotes:write'), async (req, res) => {
  try {
    const quote = await prisma.salesQuote.findUnique({ where: { id: req.params.id }, include: INCLUDE });
    if (!quote) { res.status(404).json({ error: 'Not found' }); return; }

    const quoteNumber = await generateQuoteNumber();

    const duplicate = await prisma.salesQuote.create({
      data: {
        enquiryId:       quote.enquiryId,
        quoteNumber,
        customerId:      quote.customerId,
        status:          'DRAFT',
        validUntil:      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        subtotal:        quote.subtotal,
        discountAmount:  quote.discountAmount,
        taxAmount:       quote.taxAmount,
        totalAmount:     quote.totalAmount,
        notes:           quote.notes,
        termsConditions: quote.termsConditions,
        lineItems: {
          create: quote.lineItems.map(i => ({
            serviceType: i.serviceType,
            description: i.description,
            supplierId:  i.supplierId,
            costPrice:   i.costPrice,
            markup:      i.markup,
            sellPrice:   i.sellPrice,
            quantity:    i.quantity,
            unit:        i.unit,
            details:     i.details as object,
            sortOrder:   i.sortOrder,
          })),
        },
      },
      include: INCLUDE,
    });

    res.status(201).json(toQuoteDTO(duplicate));
  } catch (err) {
    console.error('[sales-quotes POST /:id/duplicate]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── PDF data ──────────────────────────────────────────────────

router.get('/:id/pdf-data', requirePermission('sales-quotes:read'), async (req, res) => {
  try {
    const quote = await prisma.salesQuote.findUnique({ where: { id: req.params.id }, include: INCLUDE });
    if (!quote) { res.status(404).json({ error: 'Not found' }); return; }

    res.json({
      quote: toQuoteDTO(quote),
      customer: {
        name:    quote.customer.name,
        phone:   quote.customer.phone,
        email:   quote.customer.email,
        address: quote.customer.address,
      },
      agency: {
        name:    'GK Travels',
        address: process.env.AGENCY_ADDRESS ?? '',
        phone:   process.env.AGENCY_PHONE ?? '',
        email:   process.env.AGENCY_EMAIL ?? '',
        gstin:   process.env.AGENCY_GSTIN ?? '',
      },
    });
  } catch (err) {
    console.error('[sales-quotes GET /:id/pdf-data]', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
