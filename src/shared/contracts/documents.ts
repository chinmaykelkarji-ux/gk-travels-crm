// The document centre: what a file is, where it is attached, and how it is
// listed. Shared by the SPA and the API so an upload form and the route that
// accepts it can never disagree.
import { z } from 'zod';
import { queryBool } from './common.js';

export const DocumentType = z.enum([
  'FLIGHT_TICKET', 'TRAIN_TICKET', 'BUS_TICKET', 'HOTEL_CONFIRMATION', 'ACTIVITY_VOUCHER', 'VEHICLE_VOUCHER',
  'SUPPLIER_INVOICE', 'CUSTOMER_INVOICE', 'PAYMENT_RECEIPT', 'INSURANCE', 'PASSPORT', 'VISA', 'ID_PROOF', 'OTHER',
]);
export type DocumentType = z.infer<typeof DocumentType>;

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  FLIGHT_TICKET: 'Flight ticket', TRAIN_TICKET: 'Train ticket', BUS_TICKET: 'Bus ticket',
  HOTEL_CONFIRMATION: 'Hotel confirmation', ACTIVITY_VOUCHER: 'Activity voucher', VEHICLE_VOUCHER: 'Vehicle voucher',
  SUPPLIER_INVOICE: "Supplier's bill", CUSTOMER_INVOICE: 'Our invoice', PAYMENT_RECEIPT: 'Payment receipt',
  INSURANCE: 'Insurance', PASSPORT: 'Passport', VISA: 'Visa', ID_PROOF: 'Identity proof', OTHER: 'Other',
};

/** Types that carry a government identity number: they are never customer-visible. */
export const IDENTITY_TYPES: DocumentType[] = ['PASSPORT', 'VISA', 'ID_PROOF'];
/** Types that carry a date worth chasing before it passes. */
export const EXPIRING_TYPES: DocumentType[] = ['PASSPORT', 'VISA', 'INSURANCE'];

export const DocumentStatus = z.enum(['PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'EXTRACTED', 'NEEDS_REVIEW', 'LINKED', 'FAILED']);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  PENDING_UPLOAD: 'Waiting for the file', UPLOADED: 'Kept', PROCESSING: 'Being read',
  EXTRACTED: 'Read', NEEDS_REVIEW: 'Needs your check', LINKED: 'Applied', FAILED: 'Could not be read',
};

export const DocumentEntityType = z.enum([
  'customer', 'traveller', 'trip', 'booking', 'hotel', 'vehicle', 'driver', 'vendor',
  'invoice', 'payment', 'activity', 'quotation', 'enquiry', 'lead',
]);
export type DocumentEntityType = z.infer<typeof DocumentEntityType>;

export const ENTITY_LABEL: Record<DocumentEntityType, string> = {
  customer: 'Customer', traveller: 'Traveller', trip: 'Trip', booking: 'Booking', hotel: 'Hotel', vehicle: 'Vehicle',
  driver: 'Driver', vendor: 'Supplier', invoice: 'Invoice', payment: 'Payment', activity: 'Activity',
  quotation: 'Quotation', enquiry: 'Enquiry', lead: 'Lead',
};

export const DocumentLinkInput = z.object({
  entityType: DocumentEntityType,
  entityId:   z.string().trim().min(1).max(64),
  role:       z.string().trim().max(40).optional(),
});
export type DocumentLinkInput = z.infer<typeof DocumentLinkInput>;

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** What a browser may upload. Anything else is refused by name, not silently. */
export const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
};

export const DocumentCreate = z.object({
  fileName:  z.string().trim().min(1).max(200),
  mimeType:  z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
  type:      DocumentType.default('OTHER'),
  title:     z.string().trim().max(200).optional(),
  notes:     z.string().trim().max(2000).optional(),
  expiresAt: z.string().date().optional(),
  customerVisible: z.boolean().default(false),
  links:     z.array(DocumentLinkInput).max(10).default([]),
});
export type DocumentCreate = z.infer<typeof DocumentCreate>;

/** A newer copy of a document that already exists (a reissued ticket, a renewed passport). */
export const DocumentVersionCreate = DocumentCreate.omit({ links: true, customerVisible: true }).partial({ type: true });
export type DocumentVersionCreate = z.infer<typeof DocumentVersionCreate>;

export const DocumentUpdate = z.object({
  title:     z.string().trim().min(1).max(200).optional(),
  type:      DocumentType.optional(),
  notes:     z.string().trim().max(2000).nullable().optional(),
  expiresAt: z.string().date().nullable().optional(),
  customerVisible: z.boolean().optional(),
}).refine(v => Object.keys(v).length > 0, 'Nothing to change');
export type DocumentUpdate = z.infer<typeof DocumentUpdate>;

export const DocumentListQuery = z.object({
  entityType: DocumentEntityType.optional(),
  entityId:   z.string().trim().max(64).optional(),
  type:       DocumentType.optional(),
  status:     DocumentStatus.optional(),
  q:          z.string().trim().max(120).optional(),
  /** Documents whose expiry falls on or before this day — passports and visas worth chasing. */
  expiringBefore: z.string().date().optional(),
  /** Older versions are hidden unless asked for. */
  includeSuperseded: queryBool.default(false),
  page:       z.coerce.number().int().min(1).default(1),
  pageSize:   z.coerce.number().int().min(1).max(100).default(25),
});
export type DocumentListQuery = z.infer<typeof DocumentListQuery>;
