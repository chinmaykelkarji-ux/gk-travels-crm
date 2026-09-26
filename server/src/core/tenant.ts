// ============================================================
// Tenant scoping — every query on a business model is confined to the
// organisation in the current request context.
//
// Implemented as a Prisma client extension so services and routes do not
// have to remember `where: { organizationId }`:
//   - reads, counts, aggregates, updateMany/deleteMany: organizationId is
//     ANDed into `where`
//   - findUnique/update/delete/upsert: organizationId is added to the unique
//     `where` (Prisma 5 allows extra filters there), so a record from another
//     organisation is simply "not found"
//   - create/createMany/upsert-create: organizationId is filled in when the
//     caller did not set it
//
// Limits (documented, tested, and revisited in the platform phase):
//   - nested writes (`{ items: { create: [...] } }`) rely on the column's
//     schema default for the single-tenant deployment
//   - raw SQL is not scoped — filter explicitly (see routes/receivables.ts)
//   - `Organization` itself is never scoped
// ============================================================

import { Prisma } from '@prisma/client';
import { currentOrganizationId } from './requestContext.js';

/** Models carrying organizationId. tests/unit/tenant-models.test.ts checks this against schema.prisma. */
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  'User', 'Customer', 'Lead', 'Trip', 'Booking', 'Payment', 'Receivable', 'ReceivableEntry',
  'FinancialTransaction', 'Task', 'ActivityLog', 'Communication', 'Reminder', 'Vendor',
  'VendorPayment', 'Quotation', 'QuotationItem', 'Itinerary', 'ItineraryDay', 'ItineraryItem', 'Voucher',
  'Traveller', 'TripTraveller', 'CompanySettings', 'NumberingSequence', 'Invoice', 'InvoiceLineItem',
  'CreditNote', 'CreditNoteLineItem', 'DebitNote', 'DebitNoteLineItem', 'TripService',
  'OutboxEvent', 'MessageLog', 'Enquiry', 'SalesQuote', 'SalesQuoteItem', 'Session',
  'Job', 'Document', 'DocumentLink', 'DocumentExtraction', 'AiSession', 'AiAction', 'CustomerRelationship',
  'SalesQuoteOptionGroup', 'SalesQuoteParty', 'SalesQuoteItemRate', 'BookingContract', 'PaymentScheduleItem',
  'Hotel', 'HotelRoomType', 'HotelRate', 'Vehicle', 'Driver', 'Activity',
  'HotelBooking', 'VehicleAssignment', 'ActivityBooking',
  'Ticket', 'TicketSegment', 'TicketPassenger', 'TripPickupPoint', 'TaskRule',
  'LedgerAccount', 'LedgerTransaction', 'LedgerLine', 'CustomerReceipt', 'VendorBill', 'VendorPaymentV2', 'Expense', 'StaffReimbursement', 'TaxRule', 'MessageTemplate', 'Notification', 'AutomationRule', 'AutomationRun', 'PortalAccess', 'Feedback', 'AccessRole', 'ApiKey',
]);

const WHERE_OPS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert',
]);

type AnyArgs = Record<string, unknown> & { where?: Record<string, unknown>; data?: unknown; create?: Record<string, unknown> };

function scopeWhere(where: Record<string, unknown> | undefined, orgId: string): Record<string, unknown> {
  if (!where) return { organizationId: orgId };
  // A caller that sets organizationId explicitly (platform tooling) is respected.
  if (where.organizationId !== undefined) return where;
  return { ...where, organizationId: orgId };
}

function withOrg<T>(data: T, orgId: string): T {
  if (Array.isArray(data)) return data.map(d => withOrg(d, orgId)) as unknown as T;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (d.organizationId === undefined) return { ...d, organizationId: orgId } as T;
  }
  return data;
}

export function tenantExtension() {
  return Prisma.defineExtension({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          const orgId = currentOrganizationId();
          const a = args as AnyArgs;

          if (WHERE_OPS.has(operation)) a.where = scopeWhere(a.where, orgId);

          if (operation === 'create' || operation === 'createMany' || operation === 'createManyAndReturn') {
            a.data = withOrg(a.data, orgId);
          }
          if (operation === 'upsert') a.create = withOrg(a.create ?? {}, orgId);

          return query(a as typeof args);
        },
      },
    },
  });
}
