// ============================================================
// Reading a document into a proposal — and never further than that.
//
// The pipeline is a small state machine, one step per tick of the job runner,
// so a timeout retries only the step that failed:
//
//   classify  → what kind of document is this
//   extract   → fill the fields for that kind, null where it does not say
//   match     → which trip, which supplier, and what record it would create
//   (READY)   → a person opens it, corrects anything and approves
//   approve   → the ticket, stay or bill is created, the document is attached
//
// Nothing between "classify" and "approve" writes to a trip, a ticket or the
// books. Approval is a person's act, recorded as theirs, with the document and
// the model's own answer kept beside it (hard rule 8).
// ============================================================

import type { Prisma } from '@prisma/client';
import type { ZodType } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notify } from '../notifications/service.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound, notConfigured, stateConflict } from '../../core/errors.js';
import { getStorage } from '../../core/storage.js';
import { enqueueJob } from '../../core/jobs.js';
import { aiProvider, AiOutputError, type AiFilePart } from '../../ai/index.js';
import { istToday, addDays } from '../../../../src/shared/calc/istTime.js';
import {
  bestMatch, billAddsUp, billProposal, hotelProposal, matchTrip, matchVendor, summarise, ticketProposal,
  type MatchCandidate,
} from '../../../../src/shared/calc/extraction.js';
import {
  Classification, EXTRACTION_SCHEMAS, isExtractable, PROPOSAL_FOR,
  type ExtractableType, type ExtractionApproval,
} from '../../../../src/shared/contracts/extraction.js';
import { DOCUMENT_TYPE_LABEL, type DocumentType as DocumentTypeName } from '../../../../src/shared/contracts/documents.js';
import { classifyPrompt, extractPrompt } from './prompts.js';
import { createTicket } from '../tickets/service.js';
import { createHotelBooking } from '../operations/hotelBookings.service.js';
import { createBill } from '../payables/service.js';

const READABLE_STATUS = ['UPLOADED', 'EXTRACTED', 'NEEDS_REVIEW', 'FAILED', 'LINKED'];

async function documentFile(storageKey: string, fileName: string, mimeType: string): Promise<AiFilePart> {
  const storage = getStorage();
  if (!storage) throw notConfigured('Document storage');
  return { fileName, mimeType, data: await storage.read(storageKey) };
}

/** Puts a document in the queue to be read. The work happens on the job runner. */
export async function startExtraction(documentId: string, userId?: string) {
  const provider = aiProvider('extraction');
  if (!provider.isConfigured()) throw notConfigured('Reading documents (AI)');

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw notFound('Document');
  if (!READABLE_STATUS.includes(doc.status)) throw stateConflict('This document has no file to read yet');

  const running = await prisma.documentExtraction.findFirst({
    where: { documentId, status: { in: ['QUEUED', 'READING'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (running) return running;

  const extraction = await prisma.$transaction(async tx => {
    const row = await tx.documentExtraction.create({
      data: { documentId, status: 'QUEUED', step: 'classify', provider: provider.name, model: provider.model, requestedById: userId ?? null },
    });
    await tx.document.update({ where: { id: documentId }, data: { status: 'PROCESSING' } });
    await audit(tx, {
      action: 'document_read_requested', entityType: 'document', entityId: documentId, userId,
      description: `"${doc.title}" sent to be read by ${provider.name} (${provider.model})`,
    });
    return row;
  });

  await enqueueJob({ type: 'documents.extract', payload: { extractionId: extraction.id }, idempotencyKey: `extract:${extraction.id}` });
  return extraction;
}

async function fail(id: string, documentId: string, message: string, detail?: string) {
  await prisma.$transaction(async tx => {
    await tx.documentExtraction.update({ where: { id }, data: { status: 'FAILED', step: 'done', error: detail ? `${message} — ${detail}` : message } });
    await tx.document.update({ where: { id: documentId }, data: { status: 'FAILED' } });
    await audit(tx, {
      action: 'document_read_failed', entityType: 'document', entityId: documentId, source: 'AI',
      description: `Could not read the document: ${message}`,
    });
  });
}

/**
 * Advances one step and says whether there is more to do. Every step commits,
 * so a retry never repeats work that already landed.
 */
export async function advanceExtraction(id: string): Promise<{ done: boolean; step: string }> {
  const row = await prisma.documentExtraction.findUnique({ where: { id }, include: { document: true } });
  if (!row) throw notFound('Extraction');
  if (row.status === 'READY' || row.status === 'APPLIED' || row.status === 'REJECTED' || row.status === 'FAILED') {
    return { done: true, step: row.step };
  }
  const provider = aiProvider('extraction');
  const doc = row.document;

  try {
    if (row.step === 'classify') {
      const file = await documentFile(doc.storageKey, doc.fileName, doc.mimeType);
      const { instructions, question } = classifyPrompt();
      const out = await provider.extract({ task: 'classify', instructions, question, schema: Classification, files: [file], maxTokens: 1000 });
      const kind = out.data.type as DocumentTypeName;
      await prisma.documentExtraction.update({
        where: { id },
        data: {
          status: 'READING', step: isExtractable(kind) ? 'extract' : 'done',
          kind, kindConfidence: out.data.confidence, kindReason: out.data.reason,
          inputTokens: out.usage.inputTokens, outputTokens: out.usage.outputTokens, latencyMs: out.latencyMs,
        },
      });
      if (!isExtractable(kind)) {
        await fail(id, doc.id, `TravelOS does not read ${DOCUMENT_TYPE_LABEL[kind]} yet`, out.data.reason);
        return { done: true, step: 'done' };
      }
      return { done: false, step: 'extract' };
    }

    if (row.step === 'extract') {
      const kind = row.kind as ExtractableType;
      const file = await documentFile(doc.storageKey, doc.fileName, doc.mimeType);
      const { instructions, question } = extractPrompt(kind);
      // The schema is chosen at run time, so its type is the general one here;
      // it still validates the answer field by field before anything is stored.
      const schema = EXTRACTION_SCHEMAS[kind] as unknown as ZodType<Record<string, unknown>>;
      const out = await provider.extract({ task: `extract:${kind}`, instructions, question, schema, files: [file], maxTokens: 8000 });
      await prisma.documentExtraction.update({
        where: { id },
        data: {
          step: 'match', fields: out.data as Prisma.InputJsonValue,
          inputTokens: (row.inputTokens ?? 0) + out.usage.inputTokens,
          outputTokens: (row.outputTokens ?? 0) + out.usage.outputTokens,
          latencyMs: (row.latencyMs ?? 0) + out.latencyMs,
        },
      });
      return { done: false, step: 'match' };
    }

    if (row.step === 'match') {
      const { matches, proposal, tripId, vendorId } = await buildProposal(row.kind as ExtractableType, row.fields as Record<string, unknown>);
      await prisma.$transaction(async tx => {
        await tx.documentExtraction.update({
          where: { id },
          data: { status: 'READY', step: 'done', matches: matches as unknown as Prisma.InputJsonValue, proposal: proposal as Prisma.InputJsonValue, tripId, vendorId },
        });
        await tx.document.update({ where: { id: doc.id }, data: { status: 'NEEDS_REVIEW', type: row.kind as never } });
        await audit(tx, {
          action: 'document_read', entityType: 'document', entityId: doc.id, source: 'AI',
          description: `"${doc.title}" read as ${DOCUMENT_TYPE_LABEL[row.kind as DocumentTypeName]} — waiting for a person to check it`,
          after: { kind: row.kind, tripId, vendorId },
        });
        await notify({ userIds: [row.requestedById], type: 'document_ready', title: `"${doc.title}" is read and waiting for you to check it`, link: `/documents/review`, entityType: 'document', entityId: doc.id, dedupeKey: `document_ready:${id}` }, tx);
      });
      return { done: true, step: 'done' };
    }

    return { done: true, step: row.step };
  } catch (err) {
    const message = err instanceof AiOutputError ? err.message : err instanceof Error ? err.message : String(err);
    const detail = err instanceof AiOutputError ? err.detail : undefined;
    await fail(id, doc.id, message, detail);
    return { done: true, step: 'done' };
  }
}

/** What the fields mean for the records TravelOS already holds. */
async function buildProposal(kind: ExtractableType, fields: Record<string, unknown>) {
  const proposalKind = PROPOSAL_FOR[kind];
  const today = istToday();
  const window = { from: addDays(today, -400), to: addDays(today, 400) };

  const trips = await prisma.trip.findMany({
    where: { stage: { notIn: ['CANCELLED'] }, OR: [{ departure: { gte: window.from, lte: window.to } }, { returnDate: { gte: window.from, lte: window.to } }] },
    select: {
      id: true, tourName: true, destination: true, customer: true, departure: true, returnDate: true,
      travellers: { select: { traveller: { select: { firstName: true, lastName: true, displayName: true } } } },
    },
    take: 400,
  });
  const candidates = trips.map(t => ({
    id: t.id,
    label: t.tourName ?? t.destination ?? t.id,
    customerName: t.customer ?? null,
    destination: t.destination ?? null,
    departure: t.departure ?? null,
    returnDate: t.returnDate ?? null,
    travellerNames: t.travellers.map(x => x.traveller.displayName ?? `${x.traveller.firstName} ${x.traveller.lastName ?? ''}`.trim()),
  }));

  let tripMatches: MatchCandidate[] = [];
  let vendorMatches: MatchCandidate[] = [];
  let proposal: Record<string, unknown>;

  if (proposalKind === 'TICKET') {
    const p = ticketProposal(fields);
    proposal = { kind: proposalKind, ...p, summary: summarise(fields) };
    tripMatches = matchTrip({
      dates: p.segments.map(s => s.departAt?.slice(0, 10) ?? null),
      names: p.passengers.map(x => x.name),
      places: p.segments.flatMap(s => [s.fromName, s.toName]),
    }, candidates);
  } else if (proposalKind === 'HOTEL_BOOKING') {
    const p = hotelProposal(fields);
    proposal = { kind: proposalKind, ...p, summary: summarise(fields) };
    tripMatches = matchTrip({ dates: [p.checkIn, p.checkOut], names: p.guests, places: [p.city, p.hotelName] }, candidates);
  } else {
    const p = billProposal(fields);
    proposal = { kind: proposalKind, ...p, addsUp: billAddsUp(p), summary: summarise(fields) };
    tripMatches = matchTrip({ dates: [p.billDate], names: [], places: [] }, candidates);
    const vendors = await prisma.vendor.findMany({ where: { isActive: true }, select: { id: true, name: true, gstNumber: true }, take: 500 });
    vendorMatches = matchVendor(p.supplierName, p.gstin, vendors.map(v => ({ id: v.id, name: v.name, gstin: v.gstNumber })));
  }

  const trip = bestMatch(tripMatches);
  const vendor = bestMatch(vendorMatches);
  return {
    matches: { trip: trip.suggestions, vendor: vendor.suggestions },
    proposal,
    tripId: trip.chosen?.id ?? null,
    vendorId: vendor.chosen?.id ?? null,
  };
}

// ── Reading the results ──────────────────────────────────────

export async function getExtraction(id: string) {
  const row = await prisma.documentExtraction.findUnique({ where: { id }, include: { document: { select: { id: true, title: true, fileName: true, mimeType: true, type: true, status: true } } } });
  if (!row) throw notFound('Extraction');
  return row;
}

export async function extractionsFor(documentId: string) {
  return prisma.documentExtraction.findMany({ where: { documentId }, orderBy: { createdAt: 'desc' } });
}

/** Everything a person still has to check. */
export async function pendingReviews() {
  const rows = await prisma.documentExtraction.findMany({
    where: { status: { in: ['QUEUED', 'READING', 'READY'] } },
    include: { document: { select: { id: true, title: true, fileName: true, type: true } } },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  return { items: rows, total: rows.length };
}

// ── The person's decision ────────────────────────────────────

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined || value === '') {
    throw new AppError('VALIDATION_ERROR', 400, `${what} is needed before this can be saved`, { [what]: 'Fill this in' });
  }
  return value;
}

/**
 * Creates the record the proposal describes — with the person's corrections,
 * under their name. The document is attached to whatever is created.
 */
export async function approveExtraction(id: string, input: ExtractionApproval, role: string | undefined, userId?: string) {
  const row = await getExtraction(id);
  if (row.status !== 'READY') throw stateConflict('This proposal is not waiting for a decision');
  const values = { ...(row.proposal as Record<string, unknown>), ...input.values } as Record<string, unknown>;
  const kind = values.kind as string;
  const tripId = input.tripId !== undefined ? input.tripId : row.tripId;
  const vendorId = input.vendorId !== undefined ? input.vendorId : row.vendorId;

  let appliedKind = '';
  let appliedId = '';

  if (kind === 'TICKET') {
    const p = values as unknown as ReturnType<typeof ticketProposal>;
    const ticket = await createTicket({
      tripId: tripId ?? null, contractId: null, customerId: null,
      mode: p.mode, pnr: p.pnr ?? null, carrier: p.airline ?? null, bookingRef: null,
      quota: (p.quota as never) ?? null, travelClass: p.travelClass ?? null, vendorId: vendorId ?? null,
      sourceDocumentId: row.documentId, customerNotes: null, internalNotes: null,
      segments: p.segments.map(s => ({
        carrierNumber: s.serviceNumber ?? null, carrierName: p.airline ?? null,
        fromCode: s.fromCode ?? null, fromName: s.fromName, toCode: s.toCode ?? null, toName: s.toName,
        departAt: s.departAt ?? null, arriveAt: s.arriveAt ?? null, travelClass: s.travelClass ?? p.travelClass ?? null,
        boardingPoint: null, droppingPoint: null, terminal: null, platform: null, baggage: null,
      })),
      passengers: p.passengers.map(x => ({
        travellerId: null, name: x.name, paxType: 'ADULT' as const,
        age: x.age ?? null, gender: (x.gender === 'M' || x.gender === 'F' ? x.gender : null), boardingPoint: null,
      })),
      baseFare: p.fare ?? 0, taxes: 0, otherCharges: 0, serviceFee: 0, serviceFeeGstPct: null,
    } as never, role, userId);
    appliedKind = 'ticket';
    appliedId = (ticket as { id: string }).id;
  } else if (kind === 'HOTEL_BOOKING') {
    const p = values as unknown as ReturnType<typeof hotelProposal>;
    const booking = await createHotelBooking(must(tripId, 'Trip'), {
      contractId: null, hotelId: null, hotelName: must(p.hotelName, 'Hotel name'), city: p.city ?? null,
      roomTypeId: null, roomTypeName: p.roomType ?? null, mealPlan: (p.mealPlan as never) ?? null,
      checkIn: must(p.checkIn, 'Check-in'), checkOut: must(p.checkOut, 'Check-out'),
      rooms: p.rooms ?? 1, adults: 0, children: 0, travellerIds: [],
      vendorId: vendorId ?? null, confirmationNo: p.confirmationNo ?? null,
      costAmount: p.totalAmount ?? 0, sellAmount: 0, customerNotes: null, internalNotes: null,
    } as never, role, userId);
    appliedKind = 'hotel_booking';
    appliedId = (booking as { id: string }).id;
  } else if (kind === 'VENDOR_BILL') {
    const p = values as unknown as ReturnType<typeof billProposal> & { addsUp?: boolean };
    if (!billAddsUp(p)) throw new AppError('VALIDATION_ERROR', 400, 'The amounts on this bill do not add up — correct them before saving', { totalAmount: 'Before tax + GST must equal the total' });
    const bill = await createBill({
      vendorId: must(vendorId, 'Supplier'), billNumber: must(p.billNumber, 'Bill number'),
      billDate: must(p.billDate, 'Bill date'), dueDate: p.dueDate ?? null,
      category: 'OTHER_TRIP', amount: must(p.totalAmount, 'Total'), gstAmount: p.gstAmount ?? 0,
      tripId: tripId ?? null, contractId: null, description: p.description ?? null, notes: null,
    } as never, userId);
    appliedKind = 'vendor_bill';
    appliedId = (bill as { id: string }).id;
  } else {
    throw stateConflict('There is nothing to create from this document');
  }

  await prisma.$transaction(async tx => {
    await tx.documentExtraction.update({
      where: { id },
      data: { status: 'APPLIED', appliedKind, appliedId, tripId: tripId ?? null, vendorId: vendorId ?? null, reviewedById: userId ?? null, reviewedAt: new Date(), proposal: values as Prisma.InputJsonValue },
    });
    await tx.document.update({ where: { id: row.documentId }, data: { status: 'LINKED' } });
    await tx.documentLink.upsert({
      where: { documentId_entityType_entityId: { documentId: row.documentId, entityType: appliedKind === 'vendor_bill' ? 'payment' : appliedKind === 'ticket' ? 'booking' : 'hotel', entityId: appliedId } },
      create: { documentId: row.documentId, entityType: appliedKind === 'vendor_bill' ? 'payment' : appliedKind === 'ticket' ? 'booking' : 'hotel', entityId: appliedId, role: 'SOURCE' },
      update: {},
    });
    if (tripId) {
      await tx.documentLink.upsert({
        where: { documentId_entityType_entityId: { documentId: row.documentId, entityType: 'trip', entityId: tripId } },
        create: { documentId: row.documentId, entityType: 'trip', entityId: tripId, role: 'SOURCE' },
        update: {},
      });
    }
    await audit(tx, {
      action: 'document_proposal_approved', entityType: 'document', entityId: row.documentId, userId,
      description: `Read from "${row.document.title}" and saved as ${appliedKind.replace(/_/g, ' ')} ${appliedId}${input.note ? ` — ${input.note}` : ''}`,
      after: { appliedKind, appliedId, tripId, vendorId, provider: row.provider, model: row.model },
    });
  });

  return { ...(await getExtraction(id)) };
}

export async function rejectExtraction(id: string, reason: string, userId?: string) {
  const row = await getExtraction(id);
  if (row.status !== 'READY' && row.status !== 'FAILED') throw stateConflict('This proposal is not waiting for a decision');
  return prisma.$transaction(async tx => {
    const updated = await tx.documentExtraction.update({
      where: { id }, data: { status: 'REJECTED', reviewedById: userId ?? null, reviewedAt: new Date(), error: reason },
    });
    await tx.document.update({ where: { id: row.documentId }, data: { status: 'UPLOADED' } });
    await audit(tx, {
      action: 'document_proposal_rejected', entityType: 'document', entityId: row.documentId, userId,
      description: `Proposal from "${row.document.title}" set aside: ${reason}`,
    });
    return updated;
  });
}
