// Communications — sending, the log, and what a person sees of both.
import { z } from 'zod';

export const CommChannel = z.enum(['WHATSAPP', 'EMAIL']);
export type CommChannel = z.infer<typeof CommChannel>;

const id = z.string().trim().max(64).optional().nullable().transform(v => (v ? v : null));

export const CommSend = z.object({
  templateKey: z.string().trim().min(2).max(60),
  channel: CommChannel,
  customerId: id,
  tripId: id,
  receiptId: id,
  ticketId: id,
  travellerId: id,
  /** Only when the customer's own phone / email is not the one to use. */
  to: z.string().trim().max(160).optional().nullable().transform(v => (v ? v : null)),
}).refine(v => v.customerId || v.tripId, { message: 'Say which customer or trip the message is about', path: ['customerId'] });
export type CommSend = z.infer<typeof CommSend>;

export const CommOpened = z.object({
  channel: CommChannel,
  customerId: id,
  tripId: id,
  to: z.string().trim().min(3).max(160),
  subject: z.string().trim().max(200).optional().nullable().transform(v => (v ? v : null)),
  text: z.string().trim().min(1).max(4000),
  templateKey: z.string().trim().max(60).optional().nullable().transform(v => (v ? v : null)),
});
export type CommOpened = z.infer<typeof CommOpened>;

export const CommLogQuery = z.object({
  tripId: z.string().max(64).optional(),
  customerId: z.string().max(64).optional(),
}).refine(v => v.tripId || v.customerId, { message: 'Give a trip or a customer' });
export type CommLogQuery = z.infer<typeof CommLogQuery>;

export type CommStatus = 'LOGGED' | 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
export const COMM_STATUS_LABEL: Record<CommStatus, string> = {
  LOGGED: 'Opened in own app', QUEUED: 'Waiting to send', SENDING: 'Sending', SENT: 'Sent', DELIVERED: 'Delivered', READ: 'Read', FAILED: 'Not sent',
};

export interface CommPreview {
  channel: CommChannel;
  templateKey: string;
  templateName: string;
  to: string | null;
  subject: string | null;
  text: string;
  missing: string[];
  /** Why TravelOS cannot send it itself; the person can still open it in their own app. */
  cannotSend: string | null;
  openLink: string | null;
}

export interface CommView {
  id: string;
  channel: CommChannel | null;
  via: 'APP' | 'TRAVELOS' | 'LEGACY';
  status: CommStatus;
  statusLabel: string;
  reason: string | null;
  to: string;
  subject: string | null;
  text: string | null;
  templateKey: string | null;
  source: string;
  by: string | null;
  at: string;
}
