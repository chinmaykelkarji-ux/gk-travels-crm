// ============================================================
// Scheduler rules — evaluated by the `scheduler.rules` job (core/jobs.ts)
// every 15 minutes per organisation. Each rule writes idempotent outbox
// events, so a rule fires at most once per trip/service/day.
//
// No setInterval here any more: on Vercel nothing keeps a process alive.
// server/src/index.ts runs a local tick loop for development.
// ============================================================

import { addHours, differenceInCalendarDays, parseISO, isValid } from 'date-fns';
import { prisma } from '../lib/prisma.js';
import { emitEvent } from '../services/outbox.js';

const PAYMENT_REMINDER_DAYS = [7, 3, 1];

// Passport validity moved to the task engine (modules/tasks, rule
// PASSPORT_VALIDITY) in Phase 3.6; its timings are settings now.
export interface SchedulerSummary { paymentReminders: number; supplierAlerts: number; departureReminders: number }

export async function runSchedulerRules(): Promise<SchedulerSummary> {
  const summary: SchedulerSummary = { paymentReminders: 0, supplierAlerts: 0, departureReminders: 0 };
  summary.paymentReminders   = await rulePaymentReminders();
  summary.supplierAlerts     = await ruleSupplierAlerts();
  summary.departureReminders = await ruleDepartureReminders();
  return summary;
}

// Rule 1 — payment reminder at 7/3/1 days before departure for confirmed
// trips with an outstanding balance.
async function rulePaymentReminders(): Promise<number> {
  const trips = await prisma.trip.findMany({
    where: { status: { in: ['confirmed', 'in_progress'] }, balanceDue: { gt: 0 } },
    select: { id: true, departure: true, balanceDue: true },
  });

  let n = 0;
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
    n++;
  }
  return n;
}

// Rule 2 — alert the agency when a supplier confirmation is still
// outstanding within 48 hours of the service date.
async function ruleSupplierAlerts(): Promise<number> {
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
  return services.length;
}

// Rule 3 — departure reminder to the customer, sent the day before
// a confirmed trip departs.
async function ruleDepartureReminders(): Promise<number> {
  const trips = await prisma.trip.findMany({
    where: { status: { in: ['confirmed', 'in_progress'] } },
    select: { id: true, departure: true },
  });

  let n = 0;
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
    n++;
  }
  return n;
}
