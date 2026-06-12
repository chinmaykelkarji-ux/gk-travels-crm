import { addHours, differenceInCalendarDays, parseISO, isValid } from 'date-fns';
import { prisma } from '../lib/prisma.js';
import { emitEvent } from '../services/outbox.js';

const POLL_INTERVAL_MS = 15 * 60_000;
const PAYMENT_REMINDER_DAYS = [7, 3, 1];

// ── startSchedulerWorker ──────────────────────────────────────────
// Every 15 minutes, evaluates business rules and writes events to the
// outbox. Idempotency keys ensure each rule fires at most once per
// trip/service/day combination.

export function startSchedulerWorker(): void {
  console.log('[SchedulerWorker] Started');
  setInterval(() => {
    runSchedulerRules().catch(err => {
      console.error('[SchedulerWorker] Error:', err);
    });
  }, POLL_INTERVAL_MS);
}

async function runSchedulerRules(): Promise<void> {
  await rulePaymentReminders();
  await ruleSupplierAlerts();
  await ruleDepartureReminders();
}

// Rule 1 — payment reminder at 7/3/1 days before departure for confirmed
// trips with an outstanding balance.
async function rulePaymentReminders(): Promise<void> {
  const trips = await prisma.trip.findMany({
    where: { status: 'confirmed', balanceDue: { gt: 0 } },
    select: { id: true, departure: true, balanceDue: true },
  });

  for (const trip of trips) {
    if (!trip.departure) continue;
    const departureDate = parseISO(trip.departure);
    if (!isValid(departureDate)) continue;

    const daysAhead = differenceInCalendarDays(departureDate, new Date());
    if (!PAYMENT_REMINDER_DAYS.includes(daysAhead)) continue;

    await emitEvent(
      'PAYMENT_REMINDER_WHATSAPP',
      { tripId: trip.id, daysAhead },
      { idempotencyKey: `${trip.id}:${daysAhead}d` },
    );
  }
}

// Rule 2 — alert the agency when a supplier confirmation is still
// outstanding within 48 hours of the service date.
async function ruleSupplierAlerts(): Promise<void> {
  const cutoff = addHours(new Date(), 48);
  const services = await prisma.tripService.findMany({
    where: { status: 'REQUESTED', serviceDate: { lte: cutoff } },
    select: { id: true },
  });

  for (const service of services) {
    await emitEvent(
      'SUPPLIER_CONFIRMATION_ALERT',
      { tripServiceId: service.id },
      { idempotencyKey: service.id },
    );
  }
}

// Rule 3 — departure reminder to the customer, sent the day before
// a confirmed trip departs.
async function ruleDepartureReminders(): Promise<void> {
  const trips = await prisma.trip.findMany({
    where: { status: 'confirmed' },
    select: { id: true, departure: true },
  });

  for (const trip of trips) {
    if (!trip.departure) continue;
    const departureDate = parseISO(trip.departure);
    if (!isValid(departureDate)) continue;

    if (differenceInCalendarDays(departureDate, new Date()) !== 1) continue;

    await emitEvent(
      'DEPARTURE_REMINDER',
      { tripId: trip.id },
      { idempotencyKey: `${trip.id}:departure` },
    );
  }
}
