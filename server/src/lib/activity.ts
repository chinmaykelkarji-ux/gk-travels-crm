import type { Prisma, PrismaClient } from '@prisma/client';
import { today } from '../../../src/shared/utils/date.js';

export type DbClient = PrismaClient | Prisma.TransactionClient;

// ─── Action labels ────────────────────────────────────────────
// Single source of truth mapping an activity `action` key to the
// human-readable title shown in the timeline. Add new actions here
// as new workflows are wired up — never invent ad-hoc titles inline.

export const ACTIVITY_ACTION_LABEL: Record<string, string> = {
  customer_created:            'Customer Added',
  customer_updated:            'Customer Updated',
  customer_deleted:            'Customer Deleted',
  lead_created:                'Lead Added',
  lead_status_changed:         'Lead Status Changed',
  lead_converted:              'Lead Converted',
  quotation_created:           'Quotation Created',
  quotation_updated:           'Quotation Updated',
  quotation_status_changed:    'Quotation Status Changed',
  quotation_submitted:         'Quotation Submitted for Approval',
  quotation_approved:          'Quotation Approved',
  quotation_rejected:          'Quotation Rejected',
  quotation_converted:         'Quotation Converted to Trip',
  trip_created:                'Trip Created',
  trip_status_changed:         'Trip Status Changed',
  booking_created:             'Booking Created',
  booking_updated:             'Booking Updated',
  booking_cancelled:           'Booking Cancelled',
  voucher_issued:              'Voucher Issued',
  voucher_sent:                'Voucher Sent',
  communication_sent:          'Message Sent',
  itinerary_sent:              'Itinerary Sent',
  quotation_sent_comm:         'Quotation Sent',
  receivable_created:          'Receivable Raised',
  receivable_payment_recorded: 'Payment Recorded',
  receivable_overdue:          'Receivable Overdue',
  payment_received:            'Payment Received',
  payment_sent:                'Payment Sent',
  payable_created:             'Payable Recorded',
  vendor_payment_sent:         'Supplier Payment Made',
  vendor_payment_settled:      'Vendor Payment Settled',
  refund_issued:               'Refund Issued',
  adjustment_recorded:         'Adjustment Recorded',
  task_completed:              'Task Completed',
  reminder_completed:          'Reminder Completed',
};

/**
 * Builds a human-readable title from an action key, e.g.
 * 'quotation_status_changed' → 'Quotation Status Changed'.
 * Falls back to humanizing unknown keys so nothing renders blank.
 */
export function buildActivityTitle(action: string): string {
  if (ACTIVITY_ACTION_LABEL[action]) return ACTIVITY_ACTION_LABEL[action];
  return action
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Builds a plain-language description from an action and a subject/detail
 * pair, e.g. ('payment_received', 'Rohan Sharma', '₹25,000 via UPI') →
 * 'Payment received — Rohan Sharma: ₹25,000 via UPI'.
 * Used for events whose message doesn't need bespoke phrasing per call site.
 */
export function buildActivityDescription(action: string, subject: string, detail?: string): string {
  const verb = buildActivityTitle(action);
  return detail ? `${verb} — ${subject}: ${detail}` : `${verb} — ${subject}`;
}

// ─── Writer ───────────────────────────────────────────────────

export interface ActivityInput {
  action:      string;
  description: string;
  entityType:  string;
  entityId:    string;
  title?:      string;
  metadata?:   Record<string, unknown>;
  userId?:     string | null;
  before?:     unknown;
  after?:      unknown;
}

// Single writer for ActivityLog — every operational/financial event that
// should appear in the global activity feed and per-entity timelines goes
// through here so the feed stays chronological and consistently shaped.
export async function logActivity(db: DbClient, input: ActivityInput) {
  const now = new Date();
  return db.activityLog.create({
    data: {
      action:      input.action,
      title:       input.title ?? buildActivityTitle(input.action),
      description: input.description,
      entityType:  input.entityType,
      entityId:    input.entityId,
      userId:      input.userId ?? undefined,
      metadata:    (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      timestamp:   now.toISOString(),
      date:        today(),
      before:      (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after:       (input.after  ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
