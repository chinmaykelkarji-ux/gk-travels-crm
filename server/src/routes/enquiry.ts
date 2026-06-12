import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';
import type { Customer, Enquiry, SalesQuote } from '@prisma/client';

const router = Router();
router.use(requireAuth);

type EnquiryWithRelations = Enquiry & { customer: Customer; salesQuotes: SalesQuote[] };

function toEnquiryDTO(e: EnquiryWithRelations) {
  return {
    id:            e.id,
    customerId:    e.customerId,
    customerName:  e.customer.name,
    customerPhone: e.customer.phone,
    source:        e.source,
    destination:   e.destination,
    departureDate: e.departureDate?.toISOString() ?? null,
    returnDate:    e.returnDate?.toISOString() ?? null,
    pax:           e.pax,
    requirements:  e.requirements,
    budget:        e.budget !== null ? Number(e.budget) : null,
    status:        e.status,
    assignedTo:    e.assignedTo,
    notes:         e.notes,
    quotationCount: e.salesQuotes.length,
    createdAt:     e.createdAt.toISOString(),
  };
}

// ── List ──────────────────────────────────────────────────────

router.get('/', requirePermission('enquiries:read'), async (req, res) => {
  try {
    const { status, assignedTo, customerId } = req.query as Record<string, string | undefined>;
    const enquiries = await prisma.enquiry.findMany({
      where: {
        ...(status     ? { status: status as Enquiry['status'] } : {}),
        ...(assignedTo ? { assignedTo } : {}),
        ...(customerId ? { customerId } : {}),
      },
      include: { customer: true, salesQuotes: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(enquiries.map(toEnquiryDTO));
  } catch (err) {
    console.error('[enquiries GET]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Single ────────────────────────────────────────────────────

router.get('/:id', requirePermission('enquiries:read'), async (req, res) => {
  try {
    const enquiry = await prisma.enquiry.findUnique({
      where:   { id: req.params.id },
      include: { customer: true, salesQuotes: true },
    });
    if (!enquiry) { res.status(404).json({ error: 'Not found' }); return; }

    res.json({
      ...toEnquiryDTO(enquiry),
      customer: {
        id:      enquiry.customer.id,
        name:    enquiry.customer.name,
        phone:   enquiry.customer.phone,
        email:   enquiry.customer.email,
        address: enquiry.customer.address,
      },
      quotations: enquiry.salesQuotes.map(q => ({
        id:          q.id,
        quoteNumber: q.quoteNumber,
        status:      q.status,
        totalAmount: Number(q.totalAmount),
        createdAt:   q.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[enquiries GET /:id]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Create ────────────────────────────────────────────────────

router.post('/', requirePermission('enquiries:write'), async (req: AuthRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const customerId = body.customerId as string | undefined;
    const pax = Number(body.pax ?? 1);

    if (!customerId) { res.status(400).json({ error: 'customerId is required' }); return; }
    if (pax < 1) { res.status(400).json({ error: 'pax must be at least 1' }); return; }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) { res.status(400).json({ error: 'Customer not found' }); return; }

    const enquiry = await prisma.enquiry.create({
      data: {
        customerId,
        source:        (body.source as Enquiry['source']) ?? 'DIRECT',
        destination:   body.destination as string,
        departureDate: body.departureDate ? new Date(body.departureDate as string) : null,
        returnDate:    body.returnDate ? new Date(body.returnDate as string) : null,
        pax,
        requirements:  (body.requirements as string | undefined) ?? null,
        budget:        body.budget !== undefined && body.budget !== null ? Number(body.budget) : null,
        assignedTo:    (body.assignedTo as string | undefined) ?? null,
        notes:         (body.notes as string | undefined) ?? null,
      },
      include: { customer: true, salesQuotes: true },
    });

    res.status(201).json(toEnquiryDTO(enquiry));
  } catch (err) {
    console.error('[enquiries POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Update ────────────────────────────────────────────────────

router.put('/:id', requirePermission('enquiries:write'), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;

    if (body.status === 'LOST' && !(body.notes as string | undefined)?.trim()) {
      res.status(400).json({ error: 'A reason for losing this enquiry must be provided in notes' });
      return;
    }

    const data: Record<string, unknown> = {};
    for (const key of ['source', 'destination', 'pax', 'requirements', 'status', 'assignedTo', 'notes'] as const) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (body.departureDate !== undefined) data.departureDate = body.departureDate ? new Date(body.departureDate as string) : null;
    if (body.returnDate !== undefined) data.returnDate = body.returnDate ? new Date(body.returnDate as string) : null;
    if (body.budget !== undefined) data.budget = body.budget !== null ? Number(body.budget) : null;

    const enquiry = await prisma.enquiry.update({
      where:   { id: req.params.id },
      data,
      include: { customer: true, salesQuotes: true },
    });

    res.json(toEnquiryDTO(enquiry));
  } catch (err) {
    console.error('[enquiries PUT]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Delete ────────────────────────────────────────────────────

router.delete('/:id', requirePermission('enquiries:write'), async (req, res) => {
  try {
    const enquiry = await prisma.enquiry.findUnique({ where: { id: req.params.id } });
    if (!enquiry) { res.status(404).json({ error: 'Not found' }); return; }
    if (enquiry.status !== 'NEW' && enquiry.status !== 'IN_PROGRESS') {
      res.status(400).json({ error: 'Only enquiries with status NEW or IN_PROGRESS can be deleted' });
      return;
    }
    await prisma.enquiry.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[enquiries DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
