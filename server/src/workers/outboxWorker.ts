// ============================================================
// Outbox dispatch — run by the `outbox.dispatch` job (core/jobs.ts) every
// minute per organisation. Delivers PENDING outbox events through the
// WhatsApp/email adapters and records every attempt in message_logs. Errors
// are caught per event so one bad event never stalls the queue.
//
// No setInterval here any more: on Vercel nothing keeps a process alive.
// server/src/index.ts runs a local tick loop for development.
// ============================================================

import { startOfDay, endOfDay, parseISO, isValid } from 'date-fns';
import { prisma } from '../lib/prisma.js';
import { sendWhatsAppTemplate, sendWhatsAppText } from '../services/whatsapp.js';
import { paymentReminder, travelReminder, bookingConfirmation } from '../services/messageTemplates.js';
import { travellerDisplayName } from '../../../src/shared/calc/travellers.js';
import { randomUUID } from 'node:crypto';

const BATCH_SIZE   = 10;
const MAX_ATTEMPTS = 3;

export interface OutboxSummary { processed: number; sent: number; failed: number }

export async function processOutboxBatch(): Promise<OutboxSummary> {
  const events = await prisma.outboxEvent.findMany({
    where:   { status: 'PENDING', scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: 'asc' },
    take:    BATCH_SIZE,
  });
  const summary: OutboxSummary = { processed: 0, sent: 0, failed: 0 };

  for (const event of events) {
    summary.processed++;
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data:  { status: 'PROCESSING' },
    });

    try {
      await dispatchEvent(event.eventType, event.payload as Record<string, unknown>);
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data:  { status: 'SENT', processedAt: new Date() },
      });
      summary.sent++;
    } catch (err) {
      const attempts  = event.attempts + 1;
      const lastError = err instanceof Error ? err.message : String(err);
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts,
          lastError,
          status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
        },
      });
      console.error(`[outbox] Event ${event.id} (${event.eventType}) failed (attempt ${attempts}):`, lastError);
      summary.failed++;
    }
  }
  return summary;
}

async function dispatchEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
  switch (eventType) {
    case 'PAYMENT_REMINDER_WHATSAPP':
      await handlePaymentReminder(payload);
      break;
    case 'SUPPLIER_CONFIRMATION_ALERT':
      await handleSupplierAlert(payload);
      break;
    case 'DEPARTURE_REMINDER':
      await handleDepartureReminder(payload);
      break;
    case 'SERVICE_STATUS_CHANGED':
      console.log('[outbox] SERVICE_STATUS_CHANGED:', payload);
      break;
    case 'BOOKING_CONFIRMED':
      await handleBookingConfirmed(payload);
      break;
    case 'PASSPORT_VALIDITY_ALERT':
      await handlePassportValidityAlert(payload);
      break;
    default:
      console.warn('[outbox] Unknown event type:', eventType);
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'TBD';
  const d = parseISO(dateStr);
  return isValid(d) ? d.toLocaleDateString('en-IN') : dateStr;
}

// ── Handlers ──────────────────────────────────────────────────────

// PAYMENT_REMINDER_WHATSAPP — sends a payment reminder to the customer
// for an upcoming trip with an outstanding balance.
async function handlePaymentReminder(payload: Record<string, unknown>): Promise<void> {
  const tripId = payload.tripId as string;
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || !trip.phone) return;

  const template = paymentReminder({
    customerName: trip.customer,
    tripName:     trip.destination,
    amountDue:    trip.balanceDue,
    dueDate:      formatDate(trip.departure),
    agencyPhone:  process.env.AGENCY_OWNER_PHONE ?? '',
  });

  const result = await sendWhatsAppTemplate(trip.phone, template.templateName, template.params);
  if (!result.success) await sendWhatsAppText(trip.phone, template.fallbackText);

  await prisma.messageLog.create({
    data: {
      tripId:       trip.id,
      customerId:   trip.customerId,
      channel:      'WHATSAPP',
      templateName: template.templateName,
      recipient:    trip.phone,
      content:      template.fallbackText,
      status:       result.success ? 'SENT' : 'FAILED',
      error:        result.error,
    },
  });
}

// SUPPLIER_CONFIRMATION_ALERT — notifies the agency owner that a
// supplier confirmation is still outstanding within 48h of service.
async function handleSupplierAlert(payload: Record<string, unknown>): Promise<void> {
  const tripServiceId = payload.tripServiceId as string;
  const service = await prisma.tripService.findUnique({
    where:   { id: tripServiceId },
    include: { trip: true, supplier: true },
  });
  if (!service) return;

  const ownerPhone = process.env.AGENCY_OWNER_PHONE ?? '';
  const message =
    `⚠️ Confirmation pending: ${service.type} for ${service.trip.destination} ` +
    `on ${formatDate(service.serviceDate.toISOString())}. ` +
    `Supplier: ${service.supplier?.name ?? 'Not assigned'}`;

  const result = await sendWhatsAppText(ownerPhone, message);

  await prisma.messageLog.create({
    data: {
      tripId:    service.tripId,
      channel:   'WHATSAPP',
      recipient: ownerPhone,
      content:   message,
      status:    result.success ? 'SENT' : 'FAILED',
      error:     result.error,
    },
  });
}

// DEPARTURE_REMINDER — sends a travel reminder to the customer the
// day before a confirmed trip departs.
async function handleDepartureReminder(payload: Record<string, unknown>): Promise<void> {
  const tripId = payload.tripId as string;
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || !trip.phone || !trip.departure) return;

  const departureDate = parseISO(trip.departure);
  const services = isValid(departureDate)
    ? await prisma.tripService.findMany({
        where:   { tripId: trip.id, serviceDate: { gte: startOfDay(departureDate), lte: endOfDay(departureDate) } },
        orderBy: { startTime: 'asc' },
      })
    : [];

  const flightService = services.find(s => s.type === 'FLIGHT');
  const details = flightService?.details as Record<string, unknown> | null;

  const template = travelReminder({
    customerName:  trip.customer,
    tripName:      trip.destination,
    departureDate: formatDate(trip.departure),
    departureTime: (details?.departure as string) ?? 'As scheduled',
    meetingPoint:  (details?.from as string) ?? 'Departure point',
  });

  const result = await sendWhatsAppTemplate(trip.phone, template.templateName, template.params);
  if (!result.success) await sendWhatsAppText(trip.phone, template.fallbackText);

  await prisma.messageLog.create({
    data: {
      tripId:       trip.id,
      customerId:   trip.customerId,
      channel:      'WHATSAPP',
      templateName: template.templateName,
      recipient:    trip.phone,
      content:      template.fallbackText,
      status:       result.success ? 'SENT' : 'FAILED',
      error:        result.error,
    },
  });
}

// BOOKING_CONFIRMED — sends a booking confirmation to the customer
// once a sales quote has been converted into a confirmed trip.
async function handleBookingConfirmed(payload: Record<string, unknown>): Promise<void> {
  const tripId = payload.tripId as string;
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || !trip.phone) return;

  const template = bookingConfirmation({
    customerName:  trip.customer,
    tripName:      trip.destination,
    departureDate: formatDate(trip.departure),
    pax:           trip.pax,
    bookingRef:    trip.id,
  });

  const result = await sendWhatsAppTemplate(trip.phone, template.templateName, template.params);
  if (!result.success) await sendWhatsAppText(trip.phone, template.fallbackText);

  await prisma.messageLog.create({
    data: {
      tripId:       trip.id,
      customerId:   trip.customerId,
      channel:      'WHATSAPP',
      templateName: template.templateName,
      recipient:    trip.phone,
      content:      template.fallbackText,
      status:       result.success ? 'SENT' : 'FAILED',
      error:        result.error,
    },
  });
}

// PASSPORT_VALIDITY_ALERT — raises an internal task so the team chases a
// renewal before departure. Server-created task ids use the SYS-TSK- prefix,
// which the legacy client's TSK-YYYY-NNNN counter ignores.
async function handlePassportValidityAlert(payload: Record<string, unknown>): Promise<void> {
  const tripId      = payload.tripId as string;
  const travellerId = payload.travellerId as string;
  const status      = payload.status as string;
  const [trip, traveller] = await Promise.all([
    prisma.trip.findUnique({ where: { id: tripId }, select: { id: true, destination: true, departure: true, customerId: true } }),
    prisma.traveller.findUnique({ where: { id: travellerId }, select: { id: true, title: true, firstName: true, lastName: true, displayName: true, passportExpiry: true } }),
  ]);
  if (!trip || !traveller) return;

  const name  = travellerDisplayName(traveller);
  const title = `Passport ${status === 'EXPIRED' ? 'expired' : 'validity short'}: ${name} — ${trip.destination} (${trip.id})`;
  const existing = await prisma.task.findFirst({ where: { tripId, title, status: { not: 'completed' } }, select: { id: true } });
  if (existing) return;

  await prisma.task.create({
    data: {
      id:          `SYS-TSK-${randomUUID().slice(0, 12)}`,
      title,
      description: `${name}'s passport expires ${traveller.passportExpiry ?? 'unknown'}; trip departs ${trip.departure ?? 'TBD'}. Most destinations need six months' validity beyond travel. Arrange renewal or confirm the destination's rule.`,
      priority:    'high',
      status:      'pending',
      tripId,
      customerId:  trip.customerId,
      dueDate:     new Date().toISOString().slice(0, 10),
      createdDate: new Date().toISOString().slice(0, 10),
    },
  });
}
