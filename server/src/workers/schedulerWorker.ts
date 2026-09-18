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
import { passportProblemsForUpcomingTrips } from '../modules/travellers/service.js';

const PAYMENT_REMINDER_DAYS = [7, 3, 1];

export interface SchedulerSummary { paymentReminders: number; supplierAlerts: number; departureReminders: number; passportAlerts: number }

export async function runSchedulerRules(): Promise<SchedulerSummary> {
  const summary: SchedulerSummary = { paymentReminders: 0, supplierAlerts: 0, departureReminders: 0, passportAlerts: 0 };
  summary.paymentReminders   = await rulePaymentReminders();
  summary.supplierAlerts     = await ruleSupplierAlerts();
  summary.departureReminders = await ruleDepartureReminders();
  summary.passportAlerts     = await rulePassportValidity();
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

// Rule 4 — a traveller on a trip departing within 90 days whose passport is
// expired, or short of six months' validity at departure, gets a task for the
// team. One event per (trip, traveller, expiry): editing the passport re-arms it.
async function rulePassportValidity(): Promise<number> {
  const problems = await passportProblemsForUpcomingTrips(90);
  for (const p of problems) {
    await emitEvent(
      'PASSPORT_VALIDITY_ALERT',
      { tripId: p.trip.id, travellerId: p.traveller.id, status: p.status, passportExpiry: p.traveller.passportExpiry },
      { idempotencyKey: `${p.trip.id}:${p.traveller.id}:${p.traveller.passportExpiry}` },
    );
  }
  return problems.length;
}
