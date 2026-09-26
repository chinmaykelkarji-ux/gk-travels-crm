// ============================================================
// What the copilot may PROPOSE.
//
// A write tool never writes. When the model calls one, `run` checks the
// proposal against the same contract the screen's own form uses and returns
// a preview; `ai_actions` keeps it as PROPOSED. Only when the person who
// asked presses Approve does `apply` run — through the ordinary service, as
// that person, with their permission checked again (hard rule 8).
//
// Money, invoices, cancellations, stage changes and outbound sends are never
// tools. A drafted message is handed back as a WhatsApp / email link for the
// person to send themselves; TravelOS sends nothing.
// ============================================================

import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, notFound } from '../../core/errors.js';
import { TaskCreate, TaskPriority } from '../../../../src/shared/contracts/tasks.js';
import { FollowUpInput } from '../../../../src/shared/contracts/sales.js';
import { TripUpdate } from '../../../../src/shared/contracts/trips.js';
import { istToday } from '../../../../src/shared/calc/istTime.js';
import { mailtoLink, whatsappLink } from '../../../../src/shared/calc/messageLinks.js';
import * as tasks from '../tasks/service.js';
import * as enquiries from '../sales/enquiries.service.js';
import * as trips from '../trips/service.js';
import type { CopilotTool } from './tools.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A contract failure, in the words the model and the person both read. */
function parsed<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new AppError('VALIDATION_ERROR', 400, r.error.issues.map(i => `${i.path.join('.') || 'value'}: ${i.message}`).join('; '));
  return r.data;
}

async function tripLabel(id: string) {
  const t = await prisma.trip.findUnique({ where: { id }, select: { id: true, tourName: true, destination: true, stage: true, departure: true, returnDate: true, notes: true } });
  if (!t) throw notFound('Trip');
  return t;
}

// ── create_task ───────────────────────────────────────────────

type TaskIn = { title: string; details: string | null; priority: z.infer<typeof TaskPriority> | null; due: string | null; tripId: string | null };
const toTask = (i: TaskIn) => parsed(TaskCreate, {
  title: i.title, description: i.details, priority: i.priority ?? 'medium',
  // A bare date means that morning, the way the Today screen treats it.
  dueAt: i.due ? (DAY.test(i.due) ? `${i.due}T10:00` : i.due) : null,
  tripId: i.tripId, assignedToUserId: null,
});

// ── draft_message ─────────────────────────────────────────────

type DraftIn = { customerId: string; channel: 'whatsapp' | 'email'; subject: string | null; text: string };
async function draft(i: DraftIn) {
  const c = await prisma.customer.findUnique({ where: { id: i.customerId }, select: { id: true, name: true, phone: true, email: true } });
  if (!c) throw notFound('Customer');
  const link = i.channel === 'whatsapp' ? whatsappLink(c.phone, i.text) : mailtoLink(c.email, i.subject, i.text);
  return { c, link };
}

// ── propose_trip_update ───────────────────────────────────────

type TripIn = { tripId: string; tourName: string | null; departure: string | null; returnDate: string | null; noteToAdd: string | null };
async function tripChange(i: TripIn) {
  const t = await tripLabel(i.tripId);
  if (t.stage === 'COMPLETED' || t.stage === 'CANCELLED') throw new AppError('STATE_CONFLICT', 409, `Trip ${t.id} is ${t.stage.toLowerCase()}; it cannot be changed`);
  const patch: Record<string, string> = {};
  const changes: { field: string; from: string | null; to: string }[] = [];
  const set = (field: string, key: string, from: string | null, to: string | null) => {
    if (to !== null && to !== from) { patch[key] = to; changes.push({ field, from, to }); }
  };
  set('Tour name', 'tourName', t.tourName, i.tourName);
  set('Departure', 'departure', t.departure, i.departure);
  set('Return', 'returnDate', t.returnDate, i.returnDate);
  if (i.noteToAdd?.trim()) {
    const line = `[${istToday()}] ${i.noteToAdd.trim()}`;
    patch.notes = t.notes ? `${t.notes}\n${line}` : line;
    changes.push({ field: 'Note added', from: null, to: line });
  }
  if (!changes.length) throw new AppError('VALIDATION_ERROR', 400, 'Nothing would change on this trip');
  return { trip: t, patch: parsed(TripUpdate, patch), changes };
}

export const WRITE_TOOLS: CopilotTool<never>[] = [
  {
    name: 'create_task',
    description: 'Propose a task for the team (a reminder to do something), optionally on a trip. The person must approve it before it is created.',
    kind: 'write', permission: 'tasks:write',
    input: z.object({
      title: z.string().min(2).max(200).describe('What needs doing, as a short instruction'),
      details: z.string().max(2000).nullable(),
      priority: TaskPriority.nullable(),
      due: z.string().max(16).nullable().describe('When it is due: YYYY-MM-DD, or YYYY-MM-DD HH:MM in India time'),
      tripId: z.string().max(64).nullable().describe('The trip it belongs to, if any'),
    }) as never,
    run: async (i: TaskIn) => {
      const t = toTask(i);
      const trip = t.tripId ? await tripLabel(t.tripId) : null;
      return {
        summary: `Create task “${t.title}”${i.due ? ` due ${i.due}` : ''}${trip ? ` on ${trip.tourName ?? trip.destination} (${trip.id})` : ''}`,
        task: { title: t.title, details: t.description ?? null, priority: t.priority, due: i.due, tripId: t.tripId ?? null },
      };
    },
    apply: async (i: TaskIn, ctx) => {
      const row = await tasks.createTask(toTask(i), ctx.userId);
      return { type: 'task', id: row.id, label: row.title, link: row.tripId ? `/trips/${row.tripId}` : '/today' };
    },
  },
  {
    name: 'create_followup',
    description: 'Propose a follow-up on a sales enquiry: a dated reminder to call or message the customer about it. The person must approve it.',
    kind: 'write', permission: 'enquiries:write',
    input: z.object({
      enquiryId: z.string().max(64).describe('The enquiry id, from search_enquiries'),
      dueDate: z.string().max(10).describe('YYYY-MM-DD'),
      note: z.string().max(1000).nullable().describe('What to follow up about'),
    }) as never,
    run: async (i: { enquiryId: string; dueDate: string; note: string | null }) => {
      const f = parsed(FollowUpInput, { dueDate: i.dueDate, note: i.note });
      const e = await enquiries.getEnquiry(i.enquiryId);
      return {
        summary: `Follow up ${e.customer.name} about ${e.destination} on ${f.dueDate}`,
        followUp: { enquiry: e.enquiryNumber ?? e.id, customer: e.customer.name, destination: e.destination, dueDate: f.dueDate, note: f.note },
      };
    },
    apply: async (i: { enquiryId: string; dueDate: string; note: string | null }, ctx) => {
      const row = await enquiries.createFollowUp(i.enquiryId, parsed(FollowUpInput, { dueDate: i.dueDate, note: i.note }), ctx.userId);
      return { type: 'task', id: row.id, label: row.title, link: '/today' };
    },
  },
  {
    name: 'draft_message',
    description: 'Draft a WhatsApp or email message to a customer, using only facts from other tools. It is NOT sent: the person reads it, and if they approve, opens it in their own WhatsApp or mail to send. Messages are polite and respectful ("Namaste … Ji").',
    kind: 'write', permission: 'messaging:write',
    input: z.object({
      customerId: z.string().max(64),
      channel: z.enum(['whatsapp', 'email']),
      subject: z.string().max(200).nullable().describe('Email subject; null for WhatsApp'),
      text: z.string().min(2).max(3000).describe('The message itself'),
    }) as never,
    run: async (i: DraftIn) => {
      const { c, link } = await draft(i);
      return {
        summary: `Draft ${i.channel === 'whatsapp' ? 'WhatsApp' : 'email'} to ${c.name}`,
        message: { to: c.name, channel: i.channel, subject: i.subject, text: i.text },
        canOpen: link ? true : `No ${i.channel === 'whatsapp' ? 'phone number' : 'email address'} on file for this customer`,
        note: 'Nothing is sent by TravelOS.',
      };
    },
    // Approving records who agreed with the wording and hands back the link.
    // Nothing is sent and no record is changed.
    apply: async (i: DraftIn) => {
      const { c, link } = await draft(i);
      return { type: 'message_draft', id: null, label: `Message to ${c.name}`, link, external: true };
    },
  },
  {
    name: 'propose_trip_update',
    description: 'Propose a change to a trip: its tour name, departure or return date, or a note to add. Only fields given (not null) change. Stages, cancellations, prices and payments cannot be changed this way. The person must approve it.',
    kind: 'write', permission: 'trips:write',
    input: z.object({
      tripId: z.string().max(64),
      tourName: z.string().max(120).nullable(),
      departure: z.string().max(10).nullable().describe('YYYY-MM-DD'),
      returnDate: z.string().max(10).nullable().describe('YYYY-MM-DD'),
      noteToAdd: z.string().max(1000).nullable().describe('A note appended to the trip notes, dated today'),
    }) as never,
    run: async (i: TripIn) => {
      const { trip, changes } = await tripChange(i);
      return { summary: `Change trip ${trip.tourName ?? trip.destination} (${trip.id})`, changes };
    },
    apply: async (i: TripIn, ctx) => {
      const { trip, patch } = await tripChange(i);
      await trips.updateTrip(trip.id, patch, ctx.role, ctx.userId);
      return { type: 'trip', id: trip.id, label: trip.tourName ?? trip.destination, link: `/trips/${trip.id}` };
    },
  },
];
