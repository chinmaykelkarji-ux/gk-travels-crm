// ============================================================
// What the copilot is allowed to look at.
//
// Every tool declares the permission it needs, and the registry hands the
// model only the tools the person asking already has. The copilot therefore
// cannot fetch anything the person could not open themselves: a SALES user
// asking "how much do we owe suppliers?" is told it is not theirs to see,
// because the tool was never offered (architecture H.6).
//
// Each tool answers with plain, small JSON — the numbers a person would read
// off the screen, not whole rows — so an answer can be checked against the
// screen it came from. Every call is recorded in `ai_actions`.
//
// Nothing here writes anything. The write tools (writeTools.ts) only propose;
// a person approves before anything is saved (hard rule 8).
// ============================================================

import { z } from 'zod';
import { toJsonSchema } from '../../../../src/shared/calc/jsonSchema.js';
import { hasPermission } from '../../lib/permissions.js';
import { canSeeCommercials } from '../../lib/redact.js';
import { istToday, addDays } from '../../../../src/shared/calc/istTime.js';
import { financialYear, financialYearRange } from '../../../../src/shared/calc/tax.js';
import * as trips from '../trips/service.js';
import * as tasks from '../tasks/service.js';
import * as finance from '../finance/service.js';
import * as payables from '../payables/service.js';
import * as customers from '../customers/service.js';
import * as documents from '../documents/service.js';
import * as extraction from '../extraction/service.js';
import * as enquiries from '../sales/enquiries.service.js';
import { WRITE_TOOLS } from './writeTools.js';

export interface ToolContext { userId: string; role: string }

/** What an approved proposal made. `link` opens it; `external` links leave TravelOS (WhatsApp, mail). */
export interface ProposalResult { type: string; id: string | null; label: string; link: string | null; external?: boolean }

export interface CopilotTool<I = Record<string, unknown>> {
  name: string;
  /** What it answers, in the words the model needs to choose it. */
  description: string;
  kind: 'read' | 'write';
  permission: string;
  input: z.ZodType<I>;
  /** A read's answer; for a write, the preview of what it would do — nothing is saved. */
  run: (input: I, ctx: ToolContext) => Promise<unknown>;
  /** Writes only: runs after a person approves, through the ordinary service, as that person. */
  apply?: (input: I, ctx: ToolContext) => Promise<ProposalResult>;
}

const none = z.object({});
const day = z.string().describe('A date as YYYY-MM-DD');

/** Trims a list to what a person would actually read out. */
const few = <T>(rows: T[], n = 8) => rows.slice(0, n);

const READ_TOOLS: CopilotTool<never>[] = [
  {
    name: 'search_trips',
    description: 'Find tours by name, destination, customer or departure dates. Use it to answer "which trips leave this week", "is there a Kashi tour in November".',
    kind: 'read', permission: 'trips:read',
    input: z.object({
      q: z.string().max(120).nullable().describe('Words to look for: tour name, destination or customer'),
      from: day.nullable().describe('Earliest departure'),
      to: day.nullable().describe('Latest departure'),
      includeClosed: z.boolean().nullable().describe('true to include completed and cancelled tours'),
    }) as never,
    run: async (i: { q: string | null; from: string | null; to: string | null; includeClosed: boolean | null }) => {
      const page = await trips.listTrips({
        q: i.q ?? undefined, from: i.from ?? undefined, to: i.to ?? undefined,
        includeClosed: i.includeClosed ?? false, page: 1, pageSize: 20,
      } as never);
      return {
        total: page.total,
        trips: few(page.items).map(t => ({
          id: t.id, name: t.tourName ?? t.destination, destination: t.destination, stage: t.stage,
          departure: t.departure, returnDate: t.returnDate, pax: t.pax, customer: t.customer,
        })),
      };
    },
  },
  {
    name: 'get_trip',
    description: 'Everything about one tour: stage, dates, how many are travelling, what is confirmed and what is still open (hotels, transport, tickets, activities), and what is left to collect.',
    kind: 'read', permission: 'trips:read',
    input: z.object({ tripId: z.string().max(64).describe('The trip id, e.g. GK-2026-0007') }) as never,
    run: async (i: { tripId: string }, ctx) => {
      const ws = await trips.getWorkspace(i.tripId, ctx.role);
      const status = (rows: { status: string }[], done: string[]) => ({
        total: rows.filter(r => r.status !== 'CANCELLED').length,
        confirmed: rows.filter(r => done.includes(r.status)).length,
      });
      return {
        trip: {
          id: ws.trip.id, name: ws.trip.tourName ?? ws.trip.destination, destination: ws.trip.destination,
          stage: ws.trip.stageLabel ?? ws.trip.stage, departure: ws.trip.departure, returnDate: ws.trip.returnDate,
          pax: ws.trip.pax, customer: ws.trip.customer, customerId: ws.trip.customerId,
        },
        // The same checks the trip screen shows: "must fix" blocks the next stage.
        stillOpen: ws.readiness.checks.map(c => ({
          severity: c.severity === 'block' ? 'must fix' : 'to note', what: c.message, items: few(c.items ?? [], 5),
        })),
        counts: {
          travellers: ws.travellers.length,
          hotels: status(ws.hotels, ['CONFIRMED']),
          transport: status(ws.vehicles, ['CONFIRMED', 'COMPLETED']),
          activities: status(ws.activities, ['CONFIRMED']),
          tickets: status(ws.tickets, ['CONFIRMED']),
        },
        money: { totalPayable: ws.money.totalPayable, received: ws.money.paid, stillToCollect: ws.money.balance },
        openTasks: ws.tasks.length,
      };
    },
  },
  {
    name: 'search_customers',
    description: 'Find a customer by name, phone or email, with how much they have travelled with us.',
    kind: 'read', permission: 'customers:read',
    input: z.object({ q: z.string().min(2).max(120).describe('Name, phone or email') }) as never,
    run: async (i: { q: string }) => {
      const page = await customers.listCustomers({ q: i.q, page: 1, pageSize: 10 } as never);
      return {
        total: page.total,
        customers: few(page.items).map(c => ({ id: c.id, name: c.name, phone: c.phone, city: c.city, trips: c.tripCount ?? null })),
      };
    },
  },
  {
    name: 'get_customer',
    description: 'One customer in full: their tours, their families, what they owe and what they have paid.',
    kind: 'read', permission: 'customers:read',
    input: z.object({ customerId: z.string().max(64).describe('The customer id, e.g. CUS-2026-0001') }) as never,
    run: async (i: { customerId: string }, ctx) => {
      const c = await customers.getCustomer360(i.customerId);
      return {
        customer: { id: c.customer.id, name: c.customer.name, phone: c.customer.phone, city: c.customer.city },
        tripCount: c.stats.tripCount,
        trips: few(c.trips).map(t => ({ id: t.id, destination: t.destination, departure: t.departure, returnDate: t.returnDate, status: t.status, pax: t.pax })),
        money: canSeeCommercials(ctx.role)
          ? { invoiced: c.stats.invoiced, received: c.stats.received, outstanding: c.stats.outstanding, lifetimeValue: c.stats.lifetimeValue }
          : 'not theirs to see',
      };
    },
  },
  {
    name: 'search_enquiries',
    description: 'Find open sales enquiries by customer name, phone, destination or enquiry number, with their status and travel dates.',
    kind: 'read', permission: 'enquiries:read',
    input: z.object({
      q: z.string().max(120).nullable().describe('Customer, phone, destination or enquiry number; null for the latest open ones'),
      includeClosed: z.boolean().nullable().describe('true to include won and lost enquiries'),
    }) as never,
    run: async (i: { q: string | null; includeClosed: boolean | null }) => {
      const page = await enquiries.listEnquiries({ q: i.q ?? undefined, includeClosed: i.includeClosed ?? false, page: 1, pageSize: 10 });
      return {
        total: page.total,
        enquiries: few(page.items).map(e => ({
          id: e.id, number: e.enquiryNumber, customer: e.customer.name, customerId: e.customer.id, destination: e.destination,
          status: e.status, departure: e.departureDate, assignedTo: e.assignee?.name ?? null,
        })),
      };
    },
  },
  {
    name: 'get_open_tasks',
    description: 'What needs doing now: overdue work and what is due today or this week.',
    kind: 'read', permission: 'tasks:read',
    input: z.object({ mine: z.boolean().nullable().describe('true for only the asker\'s own tasks') }) as never,
    run: async (i: { mine: boolean | null }, ctx) => {
      const t = await tasks.today({ mine: i.mine ?? false } as never, ctx.userId, new Date(), ctx.role);
      return {
        counts: t.counts,
        urgent: few(t.buckets.flatMap(b => b.tasks.map(x => ({ bucket: b.bucket, title: x.title, due: x.dueAt, priority: x.priority, tripId: x.trip?.id ?? null }))), 10),
      };
    },
  },
  {
    name: 'get_money_summary',
    description: 'The money position for a period: billed, spent, profit, cash and bank in hand, what customers owe, what we owe suppliers, and the GST position. Defaults to this financial year.',
    kind: 'read', permission: 'finance:read',
    input: z.object({ from: day.nullable(), to: day.nullable() }) as never,
    run: async (i: { from: string | null; to: string | null }) => {
      const to = i.to ?? istToday();
      const from = i.from ?? financialYearRange(financialYear(to)).from;
      const s = await finance.moneySummary(from, to);
      return {
        period: { from, to },
        income: s.income, expense: s.expense, profit: s.profit, cashInHand: s.cashInHand,
        owedToUs: s.owedToUs, owedBySupplier: s.owedBySupplier, owedToStaff: s.owedToStaff,
        tax: s.tax, note: 'Tax figures are for information; verify with the CA before filing.',
      };
    },
  },
  {
    name: 'get_receivables',
    description: 'Who owes us money, oldest first, with how late each bill is.',
    kind: 'read', permission: 'finance:read',
    input: none as never,
    run: async () => {
      const r = await finance.receivables();
      return {
        total: r.total, overdue: r.overdue,
        buckets: r.buckets.map(b => ({ label: b.label, amount: b.amount })),
        customers: few(r.customers).map(c => ({
          customer: c.customerName, outstanding: c.outstanding, overdue: c.overdue,
          oldest: c.invoices[0] ? { number: c.invoices[0].number, due: c.invoices[0].dueDate, daysLate: c.invoices[0].daysOverdue } : null,
        })),
      };
    },
  },
  {
    name: 'get_trip_profit',
    description: 'What one tour billed, what it really cost, the margin and what is still to collect.',
    kind: 'read', permission: 'trips:write',
    input: z.object({ tripId: z.string().max(64) }) as never,
    run: async (i: { tripId: string }) => finance.profitForTrip(i.tripId),
  },
  {
    name: 'get_supplier_dues',
    description: 'What we owe suppliers, by how late it is, and which bills fall due next.',
    kind: 'read', permission: 'finance:read',
    input: none as never,
    run: async () => {
      const aging = await payables.payablesAging();
      return {
        outstanding: aging.total, overdue: aging.overdue, advancesNotYetApplied: aging.unappliedAdvances,
        suppliers: few(aging.vendors).map(v => ({ supplier: v.vendor, bills: v.bills, outstanding: v.outstanding, overdue: v.overdue })),
        bills: few(aging.bills).map(b => ({ bill: b.billNumber, supplier: b.vendor?.name ?? null, due: b.dueDate, outstanding: b.outstanding, daysLate: b.daysOverdue })),
      };
    },
  },
  {
    name: 'find_documents',
    description: 'Find a kept document — a ticket, a hotel confirmation, a supplier bill, a passport copy — by words, kind, or what it is attached to.',
    kind: 'read', permission: 'documents:read',
    input: z.object({
      q: z.string().max(120).nullable().describe('Words in the name, file name or note'),
      tripId: z.string().max(64).nullable().describe('Only documents attached to this trip'),
      expiringWithinDays: z.number().int().min(1).max(365).nullable().describe('Only papers that lapse within this many days'),
    }) as never,
    run: async (i: { q: string | null; tripId: string | null; expiringWithinDays: number | null }) => {
      const page = await documents.listDocuments({
        q: i.q ?? undefined,
        ...(i.tripId ? { entityType: 'trip' as const, entityId: i.tripId } : {}),
        expiringBefore: i.expiringWithinDays ? addDays(istToday(), i.expiringWithinDays) : undefined,
        includeSuperseded: false, page: 1, pageSize: 20,
      } as never);
      return {
        total: page.total,
        documents: few(page.items).map(d => ({
          id: d.id, title: d.title, kind: d.type, state: d.status, validUntil: d.expiresAt,
          attachedTo: (d.links ?? []).map(l => `${l.entityType}:${l.entityId}`),
        })),
      };
    },
  },
  {
    name: 'get_documents_to_check',
    description: 'Documents that have been read by the machine and are waiting for a person to check and save them.',
    kind: 'read', permission: 'documents:read',
    input: none as never,
    run: async () => {
      const p = await extraction.pendingReviews();
      return {
        total: p.total,
        waiting: few(p.items).map(x => ({
          id: x.id, document: x.document?.title ?? x.documentId, readAs: x.kind, state: x.status,
        })),
      };
    },
  },
];

export const TOOLS: CopilotTool<never>[] = [...READ_TOOLS, ...WRITE_TOOLS];

export const TOOL_BY_NAME = new Map(TOOLS.map(t => [t.name, t]));

/** Only the tools this person could use on the screens themselves. */
export function toolsFor(role: string): CopilotTool<never>[] {
  return TOOLS.filter(t => hasPermission(role as never, t.permission));
}

/** The tools as the model is told about them. */
export function toolSpecs(role: string) {
  return toolsFor(role).map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: toJsonSchema(t.input as never) as Record<string, unknown>,
  }));
}
