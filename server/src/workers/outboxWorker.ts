import { startOfDay, endOfDay, parseISO, isValid } from 'date-fns';
import { prisma } from '../lib/prisma.js';
import { sendWhatsAppTemplate, sendWhatsAppText } from '../services/whatsapp.js';
import { paymentReminder, travelReminder, bookingConfirmation } from '../services/messageTemplates.js';

const POLL_INTERVAL_MS = 60_000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;

// ── startOutboxWorker ────────────────────────────────────────────
// Polls for PENDING events every 60s and dispatches them. Errors are
// caught per-event so one bad event never stalls the queue.

export function startOutboxWorker(): void {
  console.log('[OutboxWorker] Started');
  setInterval(() => {
    processOutboxBatch().catch(err => {
      console.error('[OutboxWorker] Batch error:', err);
    });
  }, POLL_INTERVAL_MS);
}

async function processOutboxBatch(): Promise<void> {
  const events = await prisma.outboxEvent.findMany({
    where:   { status: 'PENDING', scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: 'asc' },
    take:    BATCH_SIZE,
  });

  for (const event of events) {
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
    } catch (err) {
      const attempts = event.attempts + 1;
      const lastError = err instanceof Error ? err.message : String(err);
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts,
          lastError,
          status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
        },
      });
      console.error(`[OutboxWorker] Event ${event.id} (${event.eventType}) failed (attempt ${attempts}):`, lastError);
    }
  }
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
      console.log('[OutboxWorker] SERVICE_STATUS_CHANGED:', payload);
      break;
    case 'BOOKING_CONFIRMED':
      await handleBookingConfirmed(payload);
      break;
    default:
      console.warn('[OutboxWorker] Unknown event type:', eventType);
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
