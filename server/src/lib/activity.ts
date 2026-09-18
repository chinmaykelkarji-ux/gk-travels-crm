import type { Prisma } from '@prisma/client';
import type { DbClient } from './prisma.js';
import { today } from '../../../src/shared/utils/date.js';

export type { DbClient };

// ─── Action labels ────────────────────────────────────────────
// Single source of truth mapping an activity `action` key to the
// human-readable title shown in the timeline. Add new actions here
// as new workflows are wired up — never invent ad-hoc titles inline.

export const ACTIVITY_ACTION_LABEL: Record<string, string> = {
  customer_created:            'Customer Added',
  customer_updated:            'Customer Updated',
  customer_deleted:            'Customer Deleted',
  customer_merged:             'Customers Merged',
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
  trip_deleted:                'Trip Deleted',
  booking_created:             'Booking Created',
  booking_updated:             'Booking Updated',
  booking_cancelled:           'Booking Cancelled',
  booking_deleted:             'Booking Deleted',
  voucher_issued:              'Voucher Issued',
  voucher_sent:                'Voucher Sent',
  voucher_deleted:             'Voucher Deleted',
  vendor_deleted:              'Vendor Deleted',
  communication_sent:          'Message Sent',
  itinerary_sent:              'Itinerary Sent',
  quotation_sent_comm:         'Quotation Sent',
  invoice_created:             'Invoice Created',
  invoice_edited:              'Invoice Edited',
  invoice_cancelled:           'Invoice Cancelled',
  invoice_deleted:             'Invoice Deleted',
  credit_note_created:         'Credit Note Created',
  credit_note_edited:          'Credit Note Edited',
  debit_note_created:          'Debit Note Created',
  debit_note_edited:           'Debit Note Edited',
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
  company_settings_updated:    'Company Master Updated',
  user_credentials_rotated:    'User Credentials Rotated',
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
  /** HUMAN (API call), SYSTEM (job/migration) or AI (copilot/extraction). */
  source?:     'HUMAN' | 'SYSTEM' | 'AI';
  requestId?:  string | null;
}

// Single writer for ActivityLog — every operational/financial event that
// should appear in the global activity feed and per-entity timelines goes
// through here so the feed stays chronological and consistently shaped.
// Prefer core/audit.ts audit(), which fills actor/source/request id from the
// request context.
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
      source:      input.source ?? 'HUMAN',
      requestId:   input.requestId ?? undefined,
    },
  });
}
