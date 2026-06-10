// ============================================================
// GK TRAVELS CRM â€” ZUSTAND STORE
//
// Architecture:
//   - In-memory store (no localStorage â€” data lives in PostgreSQL)
//   - On init: fetchAll() loads all data from Express API
//   - Mutations: update store immediately (optimistic) + fire API async
//   - All financial calculations happen in actions, never in UI
// ============================================================

import { create } from 'zustand';
import apiClient from '@/lib/apiClient';
import type {
  Trip, Lead, Customer, Passenger, Booking, Payment, Task, Reminder,
  ActivityLog, Staff, GKStoreState, TripStatus, LeadStatus,
  ActivityEntityType, Vendor, VendorPayment,
  Quotation, QuotationItem, QuotationStatus,
  Itinerary, ItineraryStatus,
  Voucher, VoucherStatus,
  Receivable, ReceivableEntry,
  Communication,
  Invoice, CreditNote, DebitNote, CompanySettings,
  CreateInvoiceInput, UpdateInvoiceInput,
  CreateCreditNoteInput, CreateDebitNoteInput, UpdateCreditDebitNoteInput,
} from '@/shared/types';
import { calcTripFinance, calcBookingFinance, calcReceivableFinance } from '@/shared/utils/finance';
import { getApiErrorMessage } from '@/shared/utils/error';
import {
  nextTripId, nextLeadId, nextCustomerId, nextBookingId, nextPassengerId,
  nextTaskId, nextPayId, nextVendorId, nextVendorPaymentId,
  nextQuotationId, nextItineraryId, nextVoucherId, uid, reminderUid, activityUid,
  nextReceivableId, nextReceivableEntryId,
} from '@/shared/utils/id';
import { today } from '@/shared/utils/date';
import { canConfirmTrip } from '@/shared/schemas/trip';
import { toast } from '@/shared/hooks/useToast';

// â”€â”€â”€ Mutation error handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// All store mutations are optimistic: the Zustand state updates
// immediately, then the API call fires asynchronously. If the API
// call fails (401, network error, DB constraint, etc.) the data
// exists in the in-memory store but was NOT written to PostgreSQL
// â€” it will disappear on the next page refresh.
//
// This helper is attached to every fire-and-forget API call so
// failures are surfaced as a visible toast instead of silently
// swallowed by console.error.
function onMutationError(label: string) {
  return (err: unknown) => {
    console.error(`[api] ${label}`, err);
    const status = (err as { response?: { status?: number } })?.response?.status;
    // 401/403 — apiClient interceptor already redirects to /login, no toast needed
    if (status === 401 || status === 403) return;
    toast.error(
      'Save failed',
      `Could not save "${label}" to the database — check your connection.`,
    );
  };
}

// â”€â”€â”€ Activity Entry Factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Using a typed factory function guarantees that `entityType` is checked
// against ActivityEntityType at the call site, avoiding generic string
// inference inside Zustand set() closures where contextual typing may not
// propagate through the complex generic signature.

function makeActivityEntry(
  action:      string,
  description: string,
  entityType:  ActivityEntityType,
  entityId:    string,
  now:         string,
): ActivityLog {
  return {
    id:         activityUid(),
    action,
    description,
    entityType,
    entityId,
    timestamp:  new Date().toISOString(),
    date:       now,
  };
}

// â”€â”€â”€ Defaults â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const defaultStaff: Staff[] = [
  { id: 1, name: 'Priya Singh',  role: 'Senior Operations', trips: 0, tasks: 0, avatar: 'PS' },
  { id: 2, name: 'Arjun Patel',  role: 'Operations',        trips: 0, tasks: 0, avatar: 'AP' },
  { id: 3, name: 'Deepak Verma', role: 'Operations',        trips: 0, tasks: 0, avatar: 'DV' },
];

const defaultState: GKStoreState = {
  trips:          [],
  leads:          [],
  customers:      [],
  passengers:     [],
  bookings:       [],
  tasks:          [],
  reminders:      [],
  activityLog:    [],
  communications: [],
  payments:       { customerPayments: [], supplierPayments: [] },
  vendors:        [],
  vendorPayments: [],
  quotations:     [],
  itineraries:    [],
  vouchers:       [],
  receivables:    [],
  staff:          defaultStaff,
  invoices:        [],
  creditNotes:     [],
  debitNotes:      [],
  companySettings: null,
  dataLoading:    true,
  dataError:      null,
};

// â”€â”€â”€ Store Actions Interface â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface StoreActions {
  // â”€â”€ Trips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createTrip:  (data: Partial<Trip>) => Trip;
  updateTrip:  (id: string, data: Partial<Trip>) => void;
  deleteTrip:  (id: string) => void;
  setTripStatus: (id: string, status: TripStatus) => { ok: boolean; reason?: string };
  recalcTripFinance: (tripId: string) => void;
  recalcAllTrips:    () => void;

  // â”€â”€ Leads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createLead:     (data: Partial<Lead>) => Lead;
  updateLead:     (id: string, data: Partial<Lead>) => void;
  deleteLead:     (id: string) => void;
  setLeadStatus:  (id: string, status: LeadStatus) => void;
  convertLead:    (leadId: string) => { ok: boolean; trip?: Trip; reason?: string };

  // â”€â”€ Customers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createCustomer: (data: Partial<Customer>) => Customer;
  updateCustomer: (id: string, data: Partial<Customer>) => void;
  deleteCustomer: (id: string) => { ok: boolean; reason?: string };

  // â”€â”€ Passengers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createPassenger: (data: Partial<Passenger>) => Passenger;
  updatePassenger: (id: string, data: Partial<Passenger>) => void;
  deletePassenger: (id: string) => void;

  // â”€â”€ Bookings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createBooking:  (data: Partial<Booking>) => Booking;
  updateBooking:  (id: string, data: Partial<Booking>) => void;
  deleteBooking:  (id: string) => void;

  // â”€â”€ Payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  recordPayment:  (payment: Partial<Payment> & { type: 'customer' | 'supplier' }) => Payment;
  updatePayment:  (id: string, type: 'customer' | 'supplier', data: Partial<Payment>) => void;
  deletePayment:  (id: string, type: 'customer' | 'supplier') => void;

  // â”€â”€ Tasks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createTask:     (data: Partial<Task>) => Task;
  updateTask:     (id: string, data: Partial<Task>) => void;
  deleteTask:     (id: string) => void;
  completeTask:   (id: string) => void;

  // â”€â”€ Reminders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  refreshAllReminders: () => void;
  markReminderSent:    (id: string) => void;

  // â”€â”€ Activity Log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Client-side optimistic entries for instant UI feedback only — the
  // server is the single source of truth (server/src/lib/activity.ts
  // writes the authoritative row); fetchAll() replaces this array wholesale.
  logActivity: (
    action: string,
    description: string,
    entityType: ActivityLog['entityType'],
    entityId: string,
    meta?: { before?: unknown; after?: unknown },
  ) => void;

  // â”€â”€ Communications (Phase 4) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Records an outbound WhatsApp/email send. The server is the single
  // writer of both the Communication row and its ActivityLog entry —
  // this just notifies it; no client-side logActivity call (no duplicates).
  logCommunication: (input: {
    type: 'whatsapp' | 'email';
    recipient: string;
    subject?: string;
    entityType: ActivityLog['entityType'];
    entityId: string;
  }) => void;

  // â”€â”€ Vendors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createVendor:        (data: Partial<Vendor>) => Vendor;
  updateVendor:        (id: string, data: Partial<Vendor>) => void;
  deleteVendor:        (id: string) => void;

  // â”€â”€ Vendor Payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createVendorPayment: (data: Partial<VendorPayment>) => VendorPayment;
  updateVendorPayment: (id: string, data: Partial<VendorPayment>) => void;
  deleteVendorPayment: (id: string) => void;
  markVendorPaid:      (id: string, paidDate?: string) => void;

  // â”€â”€ Quotations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createQuotation:        (data: Partial<Quotation> & { items?: Partial<QuotationItem>[] }) => Quotation;
  updateQuotation:        (id: string, data: Partial<Quotation> & { items?: Partial<QuotationItem>[] }) => void;
  deleteQuotation:        (id: string) => void;
  setQuotationStatus:     (id: string, status: QuotationStatus) => void;
  duplicateQuotation:     (sourceId: string) => Quotation | null;
  convertQuotationToTrip: (id: string) => Promise<{ ok: boolean; trip?: Trip; reason?: string }>;

  // Approval workflow (Phase 3) — server is authoritative; these call the
  // dedicated endpoints (which log activity centrally) and sync local state.
  submitQuotationForApproval: (id: string) => Promise<{ ok: boolean; reason?: string }>;
  approveQuotation:           (id: string, comment?: string) => Promise<{ ok: boolean; reason?: string }>;
  rejectQuotation:            (id: string, comment: string)  => Promise<{ ok: boolean; reason?: string }>;

  // â”€â”€ Itineraries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createItinerary:     (data: Partial<Itinerary>) => Itinerary;
  updateItinerary:     (id: string, data: Partial<Itinerary>) => void;
  deleteItinerary:     (id: string) => void;
  setItineraryStatus:  (id: string, status: ItineraryStatus) => void;

  // â”€â”€ Vouchers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createVoucher:      (data: Partial<Voucher>) => Voucher;
  updateVoucher:      (id: string, data: Partial<Voucher>) => void;
  deleteVoucher:      (id: string) => void;
  setVoucherStatus:   (id: string, status: VoucherStatus) => void;
  duplicateVoucher:   (sourceId: string) => Voucher | null;

  // â”€â”€ Receivables â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createReceivable:      (data: Partial<Receivable>) => Receivable;
  updateReceivable:      (id: string, data: Partial<Receivable>) => void;
  deleteReceivable:      (id: string) => void;
  addReceivableEntry:    (receivableId: string, entry: Partial<ReceivableEntry>) => ReceivableEntry | null;
  deleteReceivableEntry: (receivableId: string, entryId: string) => void;
  updateReceivableEntry: (receivableId: string, entryId: string, data: Partial<ReceivableEntry>) => void;

  // â”€â”€ Invoices (GST) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Server computes numbering, GST splits, and receivable linkage —
  // these calls are NOT optimistic; the store updates from the response.
  createInvoice: (data: CreateInvoiceInput) => Promise<{ ok: boolean; invoice?: Invoice; reason?: string }>;
  updateInvoice: (id: string, data: UpdateInvoiceInput) => Promise<{ ok: boolean; invoice?: Invoice; reason?: string }>;
  cancelInvoice: (id: string, reason: string) => Promise<{ ok: boolean; invoice?: Invoice; reason?: string }>;
  deleteInvoice: (id: string) => Promise<{ ok: boolean; reason?: string }>;

  // â”€â”€ Credit Notes (GST) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createCreditNote: (data: CreateCreditNoteInput) => Promise<{ ok: boolean; creditNote?: CreditNote; reason?: string }>;
  updateCreditNote: (id: string, data: UpdateCreditDebitNoteInput) => Promise<{ ok: boolean; creditNote?: CreditNote; reason?: string }>;
  cancelCreditNote: (id: string) => Promise<{ ok: boolean; creditNote?: CreditNote; reason?: string }>;

  // â”€â”€ Debit Notes (GST) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createDebitNote: (data: CreateDebitNoteInput) => Promise<{ ok: boolean; debitNote?: DebitNote; reason?: string }>;
  updateDebitNote: (id: string, data: UpdateCreditDebitNoteInput) => Promise<{ ok: boolean; debitNote?: DebitNote; reason?: string }>;
  cancelDebitNote: (id: string) => Promise<{ ok: boolean; debitNote?: DebitNote; reason?: string }>;

  // â”€â”€ Company Master â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  updateCompanySettings: (data: Partial<CompanySettings>) => Promise<{ ok: boolean; settings?: CompanySettings; reason?: string }>;

  // â”€â”€ Utility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  clearAll:    () => void;
  fetchAll:    () => Promise<void>;
  retryFetch:  () => Promise<void>;
}

type GKStore = GKStoreState & StoreActions;

// â”€â”€â”€ Helper: compute supplier totals for a trip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function supplierTotalsForTrip(state: GKStoreState, tripId: string) {
  const supplierPaymentsTotal = state.payments.supplierPayments
    .filter(p => p.tripId === tripId && p.status === 'paid')
    .reduce((s, p) => s + (p.amount || 0), 0);

  const bookingSupplierTotal = state.bookings
    .filter(b => b.refId === tripId && (b.supplierCost || 0) > 0)
    .reduce((s, b) => s + (b.supplierCost || 0), 0);

  const customerPaymentsTotal = state.payments.customerPayments
    .filter(p => p.tripId === tripId && p.status === 'received')
    .reduce((s, p) => s + (p.amount || 0), 0);

  return { supplierPaymentsTotal, bookingSupplierTotal, customerPaymentsTotal };
}

// â”€â”€â”€ Store Creation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const useStore = create<GKStore>()(
  (set, get) => ({
      ...defaultState,

      // â•â• Trip Actions â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      createTrip(data) {
        const state = get();
        const id    = nextTripId(state.trips.map(t => t.id));
        const now   = today();

        const trip: Trip = {
          id,
          customer:      data.customer      ?? '',
          phone:         data.phone         ?? '',
          email:         data.email,
          customerId:    data.customerId,
          destination:   data.destination   ?? '',
          type:          data.type          ?? 'Leisure',
          pax:           data.pax           ?? 1,
          departure:     data.departure     ?? null,
          returnDate:    data.returnDate     ?? null,
          status:        data.status        ?? 'draft',
          totalAmount:   data.totalAmount   ?? null,
          gstRate:       data.gstRate       ?? 5,
          gstMode:       data.gstMode       ?? 'EXCLUDED',
          taxableAmount: 0,
          discount:      data.discount      ?? 0,
          gstAmount:     0,
          totalPayable:  null,
          paidAmount:    0,
          balanceDue:    0,
          supplierCost:  0,
          grossMargin:   0,
          marginPct:     0,
          visaStatus:    data.visaStatus    ?? 'pending',
          hotelStatus:   data.hotelStatus   ?? 'pending',
          flightStatus:  data.flightStatus  ?? 'pending',
          checkInStatus: data.checkInStatus ?? 'not_due',
          assignedTo:    data.assignedTo,
          notes:         data.notes         ?? '',
          createdDate:   now,
          createdBy:     'admin',
          sourceLeadId:  data.sourceLeadId,
          timeline:      [
            {
              id:    uid(),
              date:  now,
              event: `Trip created â€” ${data.destination}`,
              type:  'system',
            },
          ],
          itinerary:     [],
          documents:     [],
          ...data,
        };

        // Run initial finance calc
        const totals = supplierTotalsForTrip({ ...state, trips: [...state.trips, trip] }, id);
        const fin    = calcTripFinance({ ...trip, ...totals });
        Object.assign(trip, {
          gstAmount:    fin.gstAmount,
          taxableAmount: fin.taxableAmount,
          totalPayable: fin.totalPayable,
          paidAmount:  fin.paidAmount,
          balanceDue:  fin.balanceDue,
          supplierCost: fin.supplierCost,
          grossMargin: fin.grossMargin,
          marginPct:   fin.marginPct,
        });

        const tripEntry = makeActivityEntry(
          'trip_created',
          `Trip ${id} created for ${trip.customer} â†’ ${trip.destination}`,
          'trip',
          id,
          now,
        );
        set((s: GKStore) => ({
          trips:       [trip, ...s.trips],
          activityLog: [tripEntry, ...s.activityLog].slice(0, 500),
        }));

        void apiClient.post('/trips', trip)
          .then(r => {
            const tripNumber = (r.data as Trip).tripNumber;
            if (tripNumber !== undefined) {
              set((s: GKStore) => ({
                trips: s.trips.map(t => t.id === id ? { ...t, tripNumber } : t),
              }));
            }
          })
          .catch(onMutationError(''));
        get().refreshAllReminders();
        return trip;
      },

      updateTrip(id, data) {
        set((s: GKStore) => {
          const newTrips = s.trips.map(t => {
            if (t.id !== id) return t;
            const updated = { ...t, ...data };
            const totals  = supplierTotalsForTrip(s, id);
            const fin     = calcTripFinance({ ...updated, ...totals });
            return {
              ...updated,
              gstAmount:    fin.gstAmount,
              taxableAmount: fin.taxableAmount,
              totalPayable: fin.totalPayable,
              paidAmount:   fin.paidAmount,
              balanceDue:   fin.balanceDue,
              supplierCost: fin.supplierCost,
              grossMargin:  fin.grossMargin,
              marginPct:    fin.marginPct,
            };
          });
          const newPayable = newTrips.find(t => t.id === id)?.totalPayable ?? null;
          const newReceivables = s.receivables.map(r => {
            if (r.tripId !== id || newPayable === null) return r;
            const fin = calcReceivableFinance({ invoiceAmount: newPayable, entries: r.entries, dueDate: r.dueDate });
            return { ...r, invoiceAmount: newPayable, totalReceived: fin.totalReceived, balanceDue: fin.balanceDue, status: fin.status };
          });
          return { trips: newTrips, receivables: newReceivables };
        });
        const updated = get().trips.find(t => t.id === id);
        if (updated) void apiClient.put(`/trips/${id}`, updated).catch(onMutationError(''));
        get().refreshAllReminders();
      },

      deleteTrip(id) {
        set((s: GKStore) => ({
          trips:       s.trips.filter(t => t.id !== id),
          receivables: s.receivables.filter(r => r.tripId !== id),
        }));
        void apiClient.delete(`/trips/${id}`).catch(onMutationError(''));
      },

      setTripStatus(id, status) {
        const trip = get().trips.find(t => t.id === id);
        if (!trip) return { ok: false, reason: 'Trip not found' };

        if (status === 'confirmed') {
          const check = canConfirmTrip(trip);
          if (!check.ok) return check;
        }

        get().updateTrip(id, {
          status,
          timeline: [
            ...trip.timeline,
            {
              id:    uid(),
              date:  today(),
              event: `Status changed to ${status.replace(/_/g, ' ')}`,
              type:  'system',
            },
          ],
        });
        get().logActivity('status_change', `Trip ${id} status â†’ ${status}`, 'trip', id);
        return { ok: true };
      },

      recalcTripFinance(tripId) {
        set((s: GKStore) => ({
          trips: s.trips.map(t => {
            if (t.id !== tripId) return t;
            const totals = supplierTotalsForTrip(s, tripId);
            const fin    = calcTripFinance({ ...t, ...totals });
            return {
              ...t,
              gstAmount:   fin.gstAmount,
              taxableAmount: fin.taxableAmount,
              totalPayable: fin.totalPayable,
              paidAmount:  fin.paidAmount,
              balanceDue:  fin.balanceDue,
              supplierCost: fin.supplierCost,
              grossMargin: fin.grossMargin,
              marginPct:   fin.marginPct,
            };
          }),
        }));
      },

      recalcAllTrips() {
        set((s: GKStore) => ({
          trips: s.trips.map(t => {
            const totals = supplierTotalsForTrip(s, t.id);
            const fin    = calcTripFinance({ ...t, ...totals });
            return {
              ...t,
              gstAmount:   fin.gstAmount,
              taxableAmount: fin.taxableAmount,
              totalPayable: fin.totalPayable,
              paidAmount:  fin.paidAmount,
              balanceDue:  fin.balanceDue,
              supplierCost: fin.supplierCost,
              grossMargin: fin.grossMargin,
              marginPct:   fin.marginPct,
            };
          }),
        }));
      },

      // â•â• Lead Actions â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      createLead(data) {
        const state = get();
        const id    = nextLeadId(state.leads.map(l => l.id));
        const now   = today();

        const lead: Lead = {
          id,
          name:        data.name        ?? '',
          phone:       data.phone       ?? '',
          email:       data.email,
          source:      data.source      ?? 'Walk-in',
          destination: data.destination ?? '',
          travelDate:  data.travelDate,
          pax:         data.pax         ?? 1,
          budget:      data.budget      ?? null,
          tripType:    data.tripType    ?? '',
          status:      data.status      ?? 'new',
          priority:    data.priority    ?? 'medium',
          notes:       data.notes       ?? '',
          followUpDate: data.followUpDate,
          assignedTo:  data.assignedTo,
          createdDate: now,
          timeline:    [{ id: uid(), date: now, event: 'Lead created', type: 'system' }],
        };

        const leadEntry = makeActivityEntry(
          'lead_created',
          `Lead ${id} created â€” ${lead.name} (${lead.source})`,
          'lead',
          id,
          now,
        );
        set((s: GKStore) => ({
          leads:       [lead, ...s.leads],
          activityLog: [leadEntry, ...s.activityLog].slice(0, 500),
        }));
        void apiClient.post('/leads', lead).catch(onMutationError(''));
        return lead;
      },

      updateLead(id, data) {
        set((s: GKStore) => ({
          leads: s.leads.map(l => l.id === id ? { ...l, ...data } : l),
        }));
        const updated = get().leads.find(l => l.id === id);
        if (updated) void apiClient.put(`/leads/${id}`, updated).catch(onMutationError(''));
      },

      deleteLead(id) {
        // Pure state removal â€” callers are responsible for the API call
        // so they can handle errors and show toasts before committing the state change.
        set((s: GKStore) => ({ leads: s.leads.filter(l => l.id !== id) }));
      },

      setLeadStatus(id, status) {
        const lead = get().leads.find(l => l.id === id);
        if (!lead) return;
        get().updateLead(id, {
          status,
          timeline: [
            ...(lead.timeline || []),
            { id: uid(), date: today(), event: `Status â†’ ${status}`, type: 'system' },
          ],
        });
        get().logActivity('lead_status', `Lead ${id} status â†’ ${status}`, 'lead', id);
      },

      convertLead(leadId) {
        const state = get();
        const lead  = state.leads.find(l => l.id === leadId);
        if (!lead) return { ok: false, reason: 'Lead not found' };
        if (lead.convertedTripId) {
          return { ok: false, reason: `Already converted to ${lead.convertedTripId}` };
        }

        // Find or create customer
        let cust = state.customers.find(c =>
          (c.phone && c.phone === lead.phone) ||
          c.name.toLowerCase() === lead.name.toLowerCase()
        );
        if (!cust) {
          cust = get().createCustomer({
            name:         lead.name,
            phone:        lead.phone || '',
            email:        lead.email,
            tripIds:      [],
            preferences:  {},
            sourceLeadId: leadId,
            createdDate:  today(),
            documents:    [],
          });
        }

        // Create trip from lead
        const trip = get().createTrip({
          customer:    lead.name,
          phone:       lead.phone || '',
          email:       lead.email,
          customerId:  cust.id,
          destination: lead.destination || '',
          departure:   lead.travelDate  || null,
          pax:         lead.pax         || 1,
          totalAmount: lead.budget      || null,
          type:        lead.tripType    || 'Leisure',
          notes:       lead.notes       || '',
          status:      'confirmed',
          sourceLeadId: leadId,
          convertedFromLeadId: leadId,
          convertedAt:  new Date().toISOString(),
          convertedBy:  'admin',
        });

        // Link customer â†’ trip
        get().updateCustomer(cust.id, {
          tripIds: [...(cust.tripIds || []), trip.id],
        });

        // Mark lead converted
        get().updateLead(leadId, {
          status:              'converted',
          convertedTripId:     trip.id,
          convertedCustomerId: cust.id,
          convertedAt:         new Date().toISOString(),
          convertedBy:         'admin',
        });

        get().logActivity(
          'lead_converted',
          `Lead ${leadId} converted â†’ Trip ${trip.id}`,
          'lead',
          leadId,
        );

        return { ok: true, trip };
      },

      // â•â• Customer Actions â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      createCustomer(data) {
        const state = get();
        const id    = nextCustomerId(state.customers.map(c => c.id));
        const cust: Customer = {
          id,
          name:        data.name        ?? '',
          phone:       data.phone       ?? '',
          email:       data.email,
          tripIds:     data.tripIds     ?? [],
          preferences: data.preferences ?? {},
          notes:       data.notes,
          createdDate: data.createdDate ?? today(),
          sourceLeadId: data.sourceLeadId,
          documents:   data.documents   ?? [],
          ...data,
        };
        set((s: GKStore) => ({ customers: [cust, ...s.customers] }));
        void apiClient.post('/customers', cust)
          .then(r => {
            const customerNumber = (r.data as Customer).customerNumber;
            if (customerNumber !== undefined) {
              set((s: GKStore) => ({
                customers: s.customers.map(c => c.id === id ? { ...c, customerNumber } : c),
              }));
            }
          })
          .catch(onMutationError(''));
        return cust;
      },

      updateCustomer(id, data) {
        set((s: GKStore) => ({
          customers: s.customers.map(c => c.id === id ? { ...c, ...data } : c),
        }));
        const updated = get().customers.find(c => c.id === id);
        if (updated) void apiClient.put(`/customers/${id}`, updated).catch(onMutationError(''));
      },

      deleteCustomer(id) {
        const state = get();
        const customer = state.customers.find(c => c.id === id);
        if (!customer) return { ok: false, reason: 'Customer not found' };

        const ACTIVE_TRIP_STATUSES: TripStatus[] = ['draft', 'quotation', 'confirmed', 'in_progress'];
        const linkedTrips = state.trips.filter(t =>
          (t.customerId === id || (customer.tripIds ?? []).includes(t.id)) &&
          ACTIVE_TRIP_STATUSES.includes(t.status)
        );
        const linkedBookings = state.bookings.filter(b =>
          b.customerId === id && !['completed', 'cancelled'].includes(b.status)
        );
        if (linkedTrips.length > 0 || linkedBookings.length > 0) {
          const parts: string[] = [];
          if (linkedTrips.length)    parts.push(`${linkedTrips.length} active trip${linkedTrips.length > 1 ? 's' : ''}`);
          if (linkedBookings.length) parts.push(`${linkedBookings.length} active booking${linkedBookings.length > 1 ? 's' : ''}`);
          return { ok: false, reason: `Cannot delete — customer is linked to ${parts.join(' and ')}. Cancel or complete them first.` };
        }

        set((s: GKStore) => ({ customers: s.customers.filter(c => c.id !== id) }));
        void apiClient.delete(`/customers/${id}`).catch(onMutationError(''));
        get().logActivity('customer_deleted', `Customer ${id} (${customer.name}) deleted`, 'customer', id);
        return { ok: true };
      },

      // â•â• Booking Actions â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      createPassenger(data) {
        const state = get();
        const id    = nextPassengerId(state.passengers.map(p => p.id));
        const passenger = {
          id,
          customerId:            data.customerId,
          firstName:             data.firstName             ?? '',
          lastName:              data.lastName              ?? '',
          displayName:           data.displayName,
          dateOfBirth:           data.dateOfBirth,
          nationality:           data.nationality,
          gender:                data.gender,
          passportNumber:        data.passportNumber,
          passportIssueDate:     data.passportIssueDate,
          passportExpiry:        data.passportExpiry,
          placeOfIssue:          data.placeOfIssue,
          visaStatus:            data.visaStatus,
          visaExpiry:            data.visaExpiry,
          visaCountry:           data.visaCountry,
          visaType:              data.visaType,
          frequentFlyerNumber:   data.frequentFlyerNumber,
          mealPreference:        data.mealPreference,
          seatPreference:        data.seatPreference,
          emergencyContactName:  data.emergencyContactName,
          emergencyContactPhone: data.emergencyContactPhone,
          emergencyRelation:     data.emergencyRelation,
          notes:                 data.notes,
          createdDate:           today(),
        };
        set((s) => ({ passengers: [passenger, ...s.passengers] }));
        void apiClient.post('/passengers', passenger).catch(onMutationError(''));
        return passenger;
      },

      updatePassenger(id, data) {
        set((s) => ({
          passengers: s.passengers.map(p => p.id === id ? { ...p, ...data } : p),
        }));
        const updated = get().passengers.find(p => p.id === id);
        if (updated) void apiClient.put('/passengers/' + id, updated).catch(onMutationError(''));
      },

      deletePassenger(id) {
        set((s) => ({ passengers: s.passengers.filter(p => p.id !== id) }));
        void apiClient.delete('/passengers/' + id).catch(onMutationError(''));
      },

      createBooking(data) {
        const state = get();
        const id    = nextBookingId(state.bookings.map(b => b.id));
        const fin   = calcBookingFinance({
          sellingPrice:      data.sellingPrice      ?? null,
          gstRate:           data.gstRate           ?? 0,
          gstMode:           data.gstMode           ?? 'EXCLUDED',
          advance:           data.advance           ?? 0,
          supplierCost:      data.supplierCost      ?? 0,
          supplierPaid:      data.supplierPaid      ?? 0,
          serviceMarginMode: data.serviceMarginMode ?? false,
          convenienceFee:    data.convenienceFee    ?? 0,
        });
        const booking: Booking = {
          id,
          type:          data.type          ?? 'flight',
          status:        data.status        ?? 'pending',
          customerName:  data.customerName  ?? '',
          customerId:    data.customerId,
          refId:         data.refId,
          sellingPrice:  data.sellingPrice  ?? null,
          supplierCost:  data.supplierCost  ?? 0,
          advance:       data.advance       ?? 0,
          supplierPaid:  data.supplierPaid  ?? 0,
          gstRate:       data.gstRate       ?? 0,
          ...fin,
          detail:        data.detail        ?? {},
          createdDate:   today(),
          notes:         data.notes         ?? '',
        };
        set((s: GKStore) => ({ bookings: [booking, ...s.bookings] }));
        void apiClient.post('/bookings', booking).catch(onMutationError(''));
        if (booking.refId) get().recalcTripFinance(booking.refId);
        return booking;
      },

      updateBooking(id, data) {
        set((s: GKStore) => {
          const newBookings = s.bookings.map(b => {
            if (b.id !== id) return b;
            const updated = { ...b, ...data };
            const fin     = calcBookingFinance(updated);
            return { ...updated, ...fin };
          });
          const newPayable = newBookings.find(b => b.id === id)?.totalPayable ?? null;
          const newReceivables = s.receivables.map(r => {
            if (r.bookingId !== id || newPayable === null) return r;
            const fin = calcReceivableFinance({ invoiceAmount: newPayable, entries: r.entries, dueDate: r.dueDate });
            return { ...r, invoiceAmount: newPayable, totalReceived: fin.totalReceived, balanceDue: fin.balanceDue, status: fin.status };
          });
          return { bookings: newBookings, receivables: newReceivables };
        });
        const booking = get().bookings.find(b => b.id === id);
        if (booking) void apiClient.put(`/bookings/${id}`, booking).catch(onMutationError(''));
        if (booking?.refId) get().recalcTripFinance(booking.refId);
      },

      deleteBooking(id) {
        const booking = get().bookings.find(b => b.id === id);
        set((s: GKStore) => ({
          bookings:    s.bookings.filter(b => b.id !== id),
          receivables: s.receivables.filter(r => r.bookingId !== id),
        }));
        void apiClient.delete(`/bookings/${id}`).catch(onMutationError(''));
        if (booking?.refId) get().recalcTripFinance(booking.refId);
      },

      // â•â• Payment Actions â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      recordPayment(paymentData) {
        const state = get();
        const isCustomer = paymentData.type === 'customer';
        const prefix: 'PAY' | 'SP' = isCustomer ? 'PAY' : 'SP';
        const list   = isCustomer
          ? state.payments.customerPayments
          : state.payments.supplierPayments;
        const id  = nextPayId(prefix, list.map(p => p.id));
        const now = today();

        const payment: Payment = {
          id,
          type:      paymentData.type,
          tripId:    paymentData.tripId,
          bookingId: paymentData.bookingId,
          customer:  paymentData.customer,
          customerId: paymentData.customerId,
          amount:    paymentData.amount   ?? 0,
          method:    paymentData.method   ?? 'Cash',
          date:      paymentData.date     ?? now,
          status:    paymentData.status   ?? (isCustomer ? 'received' : 'paid'),
          reference: paymentData.reference,
          notes:     paymentData.notes,
        };

        set((s: GKStore) => {
          const payments = { ...s.payments };
          if (isCustomer) {
            payments.customerPayments = [...s.payments.customerPayments, payment];
          } else {
            payments.supplierPayments = [...s.payments.supplierPayments, payment];
          }
          return { payments };
        });

        if (paymentData.tripId) get().recalcTripFinance(paymentData.tripId);

        get().logActivity(
          'payment_recorded',
          `${isCustomer ? 'Customer' : 'Supplier'} payment â‚¹${payment.amount} recorded`,
          'payment',
          payment.tripId || payment.bookingId || id,
        );

        void apiClient.post('/payments', payment).catch(onMutationError(''));
        return payment;
      },

      updatePayment(id, type, data) {
        set((s: GKStore) => {
          const payments = { ...s.payments };
          if (type === 'customer') {
            payments.customerPayments = s.payments.customerPayments.map(p =>
              p.id === id ? { ...p, ...data } : p
            );
          } else {
            payments.supplierPayments = s.payments.supplierPayments.map(p =>
              p.id === id ? { ...p, ...data } : p
            );
          }
          return { payments };
        });
        const list = type === 'customer'
          ? get().payments.customerPayments
          : get().payments.supplierPayments;
        const pay = list.find(p => p.id === id);
        if (pay?.tripId) get().recalcTripFinance(pay.tripId);
        if (pay) void apiClient.put(`/payments/${id}`, pay).catch(onMutationError(''));
      },

      deletePayment(id, type) {
        const state = get();
        const list  = type === 'customer' ? state.payments.customerPayments : state.payments.supplierPayments;
        const pay   = list.find(p => p.id === id);
        set((s: GKStore) => {
          const payments = { ...s.payments };
          if (type === 'customer') {
            payments.customerPayments = s.payments.customerPayments.filter(p => p.id !== id);
          } else {
            payments.supplierPayments = s.payments.supplierPayments.filter(p => p.id !== id);
          }
          return { payments };
        });
        if (pay?.tripId) get().recalcTripFinance(pay.tripId);
        void apiClient.delete(`/payments/${id}`).catch(onMutationError(''));
      },

      // â•â• Task Actions â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      createTask(data) {
        const state = get();
        const id    = nextTaskId(state.tasks.map(t => t.id));
        const task: Task = {
          id,
          title:       data.title       ?? 'Untitled task',
          description: data.description,
          priority:    data.priority     ?? 'medium',
          status:      data.status       ?? 'pending',
          tripId:      data.tripId,
          bookingId:   data.bookingId,
          customerId:  data.customerId,
          dueDate:     data.dueDate,
          assignedTo:  data.assignedTo,
          createdDate: today(),
        };
        set((s: GKStore) => ({ tasks: [task, ...s.tasks] }));
        void apiClient.post('/tasks', task).catch(onMutationError(''));
        return task;
      },

      updateTask(id, data) {
        set((s: GKStore) => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, ...data } : t) }));
        const updated = get().tasks.find(t => t.id === id);
        if (updated) void apiClient.put(`/tasks/${id}`, updated).catch(onMutationError(''));
      },

      completeTask(id) {
        get().updateTask(id, { status: 'completed', completedDate: today() });
      },

      deleteTask(id) {
        set((s: GKStore) => ({ tasks: s.tasks.filter(t => t.id !== id) }));
        void apiClient.delete(`/tasks/${id}`).catch(onMutationError('deleteTask'));
      },

      // â•â• Reminder Actions â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      refreshAllReminders() {
        const state = get();
        const now   = new Date();
        now.setHours(0, 0, 0, 0);
        const newReminders: Reminder[] = [];

        for (const trip of state.trips) {
          if (!trip.departure) continue;
          const dep      = new Date(trip.departure);
          const daysLeft = Math.round((dep.getTime() - now.getTime()) / 86_400_000);

          if (daysLeft < -7) continue; // Don't alert for old trips

          if (daysLeft <= 1 && daysLeft >= 0 && trip.checkInStatus !== 'done') {
            newReminders.push({
              id: reminderUid(), tripId: trip.id,
              type: 'web_checkin', priority: 'urgent',
              message: `Web check-in for ${trip.customer} â€” ${daysLeft === 0 ? 'today' : 'tomorrow'} (${trip.departure})`,
              dueDate: trip.departure, sent: false,
            });
          }
          if (daysLeft >= 0 && daysLeft <= 3 && (trip.balanceDue ?? 0) > 0) {
            newReminders.push({
              id: reminderUid(), tripId: trip.id,
              type: 'balance_payment', priority: 'urgent',
              message: `Balance â‚¹${trip.balanceDue} due from ${trip.customer} â€” departing in ${daysLeft}d`,
              dueDate: trip.departure, sent: false,
            });
          } else if (daysLeft > 3 && daysLeft <= 7 && (trip.balanceDue ?? 0) > 0) {
            newReminders.push({
              id: reminderUid(), tripId: trip.id,
              type: 'balance_payment', priority: 'high',
              message: `Balance â‚¹${trip.balanceDue} pending â€” ${trip.customer} (${trip.destination})`,
              dueDate: trip.departure, sent: false,
            });
          }
          if (trip.visaStatus === 'submitted') {
            newReminders.push({
              id: reminderUid(), tripId: trip.id,
              type: 'visa_followup', priority: 'medium',
              message: `Follow up visa status for ${trip.customer} â€” ${trip.destination}`,
              dueDate: trip.departure, sent: false,
            });
          }
          if (daysLeft >= 0 && daysLeft <= 3) {
            newReminders.push({
              id: reminderUid(), tripId: trip.id,
              type: 'final_documents', priority: 'high',
              message: `Send final documents to ${trip.customer} â€” departing in ${daysLeft}d to ${trip.destination}`,
              dueDate: trip.departure, sent: false,
            });
          }
        }

        // Preserve manually sent reminders
        const preserved = state.reminders.filter(r => r.sent);
        set({ reminders: [...preserved, ...newReminders].slice(0, 300) });
      },

      markReminderSent(id) {
        set((s: GKStore) => ({
          reminders: s.reminders.map(r =>
            r.id === id ? { ...r, sent: true, sentAt: new Date().toISOString() } : r
          ),
        }));
      },

      // â•â• Activity Log â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      logActivity(action, description, entityType, entityId, meta) {
        const entry: ActivityLog = {
          id:          activityUid(),
          action,      description, entityType, entityId,
          timestamp:   new Date().toISOString(),
          date:        today(),
          before:      meta?.before,
          after:       meta?.after,
        };
        set((s: GKStore) => ({
          activityLog: [entry, ...s.activityLog].slice(0, 500),
        }));
      },

      logCommunication(input) {
        const id  = `comm-${activityUid()}`;
        const now = new Date().toISOString();
        const entry: Communication = {
          id,
          type:       input.type,
          recipient:  input.recipient,
          subject:    input.subject,
          entityType: input.entityType,
          entityId:   input.entityId,
          createdAt:  now,
        };
        set((s: GKStore) => ({
          communications: [entry, ...s.communications].slice(0, 500),
        }));
        void apiClient.post('/communications', {
          type:       input.type,
          recipient:  input.recipient,
          subject:    input.subject,
          entityType: input.entityType,
          entityId:   input.entityId,
        }).catch(onMutationError(''));
      },

      // â•â• Vendor Actions â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      createVendor(data) {
        const state = get();
        const id    = nextVendorId(state.vendors.map(v => v.id));
        const vendor: Vendor = {
          id,
          name:          data.name          ?? '',
          companyName:   data.companyName,
          type:          data.type          ?? 'miscellaneous',
          contactPerson: data.contactPerson,
          phone:         data.phone         ?? '',
          whatsapp:      data.whatsapp,
          email:         data.email,
          destinations:  data.destinations  ?? [],
          paymentTerms:  data.paymentTerms,
          bankDetails:   data.bankDetails   ?? {},
          gstNumber:     data.gstNumber,
          notes:         data.notes,
          isActive:      data.isActive      ?? true,
          createdDate:   today(),
        };
        set((s: GKStore) => ({ vendors: [vendor, ...s.vendors] }));
        void apiClient.post('/vendors', vendor).catch(onMutationError(''));
        return vendor;
      },

      updateVendor(id, data) {
        set((s: GKStore) => ({
          vendors: s.vendors.map(v => v.id === id ? { ...v, ...data } : v),
        }));
        const updated = get().vendors.find(v => v.id === id);
        if (updated) void apiClient.put(`/vendors/${id}`, updated).catch(onMutationError(''));
      },

      deleteVendor(id) {
        set((s: GKStore) => ({
          vendors:        s.vendors.filter(v => v.id !== id),
          vendorPayments: s.vendorPayments.filter(p => p.vendorId !== id),
        }));
        // No fire-and-forget â€” callers handle the API call before calling this
      },

      // â•â• Vendor Payment Actions â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      createVendorPayment(data) {
        const state = get();
        const id    = nextVendorPaymentId(state.vendorPayments.map(p => p.id));
        const totalCost   = data.totalCost   ?? 0;
        const advancePaid = data.advancePaid ?? 0;
        const isPaid      = data.isPaid      ?? false;
        const payment: VendorPayment = {
          id,
          vendorId:    data.vendorId    ?? '',
          vendorName:  data.vendorName  ?? '',
          tripId:      data.tripId,
          tripName:    data.tripName,
          description: data.description,
          totalCost,
          advancePaid,
          outstanding: isPaid ? 0 : Math.max(0, totalCost - advancePaid),
          isPaid,
          paidDate:    data.paidDate,
          dueDate:     data.dueDate,
          notes:       data.notes,
          createdDate: today(),
        };
        set((s: GKStore) => ({ vendorPayments: [payment, ...s.vendorPayments] }));
        void apiClient.post('/vendors/payments', payment).catch(onMutationError(''));
        return payment;
      },

      updateVendorPayment(id, data) {
        set((s: GKStore) => ({
          vendorPayments: s.vendorPayments.map(p => {
            if (p.id !== id) return p;
            const updated = { ...p, ...data };
            const outstanding = updated.isPaid ? 0 : Math.max(0, updated.totalCost - updated.advancePaid);
            return { ...updated, outstanding };
          }),
        }));
        const updated = get().vendorPayments.find(p => p.id === id);
        if (updated) void apiClient.put(`/vendors/payments/${id}`, updated).catch(onMutationError(''));
      },

      deleteVendorPayment(id) {
        // State-only â€” callers own the API call
        set((s: GKStore) => ({ vendorPayments: s.vendorPayments.filter(p => p.id !== id) }));
      },

      markVendorPaid(id, paidDate) {
        const date = paidDate ?? today();
        set((s: GKStore) => ({
          vendorPayments: s.vendorPayments.map(p =>
            p.id === id ? { ...p, isPaid: true, outstanding: 0, paidDate: date } : p
          ),
        }));
        void apiClient.put(`/vendors/payments/${id}/mark-paid`, { paidDate: date })
          .catch(onMutationError(''));
      },

      // â•â• Quotation Actions â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      createQuotation(data) {
        const state = get();
        const id    = nextQuotationId(state.quotations.map(q => q.id));
        const quotation: Quotation = {
          id,
          quotationNumber: id,
          customerId:      data.customerId,
          customerName:    data.customerName   ?? '',
          customerPhone:   data.customerPhone,
          customerEmail:   data.customerEmail,
          destination:     data.destination    ?? '',
          startDate:       data.startDate,
          endDate:         data.endDate,
          pax:             data.pax            ?? 1,
          status:          'draft',
          approvalStatus:  'DRAFT',
          notes:           data.notes,
          termsAndConds:   data.termsAndConds,
          validUntil:      data.validUntil,
          inclusions:      data.inclusions,
          exclusions:      data.exclusions,
          paymentPolicy:   data.paymentPolicy,
          gstRate:         data.gstRate   ?? 0,
          gstMode:         data.gstMode   ?? 'EXCLUDED',
          gstAmount:       data.gstAmount ?? 0,
          taxableAmount:   data.taxableAmount ?? 0,
          totalCost:       0, totalSelling: 0, grossProfit: 0, marginPct: 0,
          createdDate:     today(),
          items:           [],
        };
        set((s: GKStore) => ({ quotations: [quotation, ...s.quotations] }));
        void apiClient.post('/quotations', { ...quotation, items: data.items ?? [] })
          .then(r => {
            // Replace optimistic record with server-computed one (correct item IDs + totals)
            set((s: GKStore) => ({
              quotations: s.quotations.map(q => q.id === id ? r.data as Quotation : q),
            }));
          })
          .catch(onMutationError(''));
        return quotation;
      },

      updateQuotation(id, data) {
        set((s: GKStore) => ({
          quotations: s.quotations.map(q => q.id === id ? { ...q, ...data } : q),
        }));
        void apiClient.put(`/quotations/${id}`, data)
          .then(r => {
            set((s: GKStore) => ({
              quotations: s.quotations.map(q => q.id === id ? r.data as Quotation : q),
            }));
          })
          .catch(onMutationError(''));
      },

      deleteQuotation(id) {
        set((s: GKStore) => ({ quotations: s.quotations.filter(q => q.id !== id) }));
      },

      setQuotationStatus(id, status) {
        const now = today();
        set((s: GKStore) => ({
          quotations: s.quotations.map(q => {
            if (q.id !== id) return q;
            return {
              ...q, status,
              sentAt:     status === 'sent'     ? now : q.sentAt,
              acceptedAt: status === 'accepted' ? now : q.acceptedAt,
              rejectedAt: status === 'rejected' ? now : q.rejectedAt,
            };
          }),
        }));
        void apiClient.put(`/quotations/${id}/status`, { status })
          .then(r => set((s: GKStore) => ({
            quotations: s.quotations.map(q => q.id === id ? r.data as Quotation : q),
          })))
          .catch(onMutationError(''));
      },

      duplicateQuotation(sourceId) {
        const src = get().quotations.find(q => q.id === sourceId);
        if (!src) return null;
        const state = get();
        const id    = nextQuotationId(state.quotations.map(q => q.id));
        const copy: Quotation = {
          ...src,
          id, quotationNumber: id,
          status: 'draft',
          approvalStatus: 'DRAFT',
          approvalComment: undefined, submittedBy: undefined, submittedAt: undefined,
          approvedBy: undefined, approvedAt: undefined,
          sentAt: undefined, acceptedAt: undefined, rejectedAt: undefined,
          convertedTripId: undefined, convertedAt: undefined,
          createdDate: today(),
          items: src.items.map(it => ({ ...it, id: uid(), quotationId: id })),
        };
        set((s: GKStore) => ({ quotations: [copy, ...s.quotations] }));
        void apiClient.post(`/quotations/${sourceId}/duplicate`)
          .then(r => set((s: GKStore) => ({
            quotations: s.quotations.map(q => q.id === id ? r.data as Quotation : q),
          })))
          .catch(onMutationError(''));
        return copy;
      },

      async convertQuotationToTrip(id) {
        try {
          const res = await apiClient.post(`/quotations/${id}/convert-trip`);
          const { quotation, trip } = res.data as { quotation: Quotation; trip: Trip };
          set((s: GKStore) => ({
            quotations: s.quotations.map(q => q.id === id ? quotation : q),
            trips:      [trip, ...s.trips],
          }));
          return { ok: true, trip };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Conversion failed') };
        }
      },

      // Approval workflow — server validates, persists, and writes the
      // ActivityLog entry atomically; we just sync the returned record.
      async submitQuotationForApproval(id) {
        try {
          const res = await apiClient.post(`/quotations/${id}/submit`);
          const q   = res.data as Quotation;
          set((s: GKStore) => ({ quotations: s.quotations.map(x => x.id === id ? q : x) }));
          return { ok: true };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Submit for approval failed') };
        }
      },

      async approveQuotation(id, comment) {
        try {
          const res = await apiClient.post(`/quotations/${id}/approve`, { comment });
          const q   = res.data as Quotation;
          set((s: GKStore) => ({ quotations: s.quotations.map(x => x.id === id ? q : x) }));
          return { ok: true };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Approval failed') };
        }
      },

      async rejectQuotation(id, comment) {
        try {
          const res = await apiClient.post(`/quotations/${id}/reject`, { comment });
          const q   = res.data as Quotation;
          set((s: GKStore) => ({ quotations: s.quotations.map(x => x.id === id ? q : x) }));
          return { ok: true };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Rejection failed') };
        }
      },

      // â•â• Itinerary Actions â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      createItinerary(data) {
        const state = get();
        const id    = nextItineraryId(state.itineraries.map(i => i.id));
        const itinerary: Itinerary = {
          id,
          tripId:          data.tripId,
          quotationId:     data.quotationId,
          title:           data.title         ?? '',
          destination:     data.destination   ?? '',
          customerName:    data.customerName  ?? '',
          customerPhone:   data.customerPhone,
          customerEmail:   data.customerEmail,
          startDate:       data.startDate,
          endDate:         data.endDate,
          pax:             data.pax            ?? 1,
          status:          'draft',
          notes:           data.notes,
          emergencyContact: data.emergencyContact,
          template:        data.template,
          createdDate:     today(),
          days:            data.days ?? [],
        };
        set((s: GKStore) => ({ itineraries: [itinerary, ...s.itineraries] }));
        void apiClient.post('/itineraries', itinerary)
          .then(r => set((s: GKStore) => ({
            itineraries: s.itineraries.map(i => i.id === id ? r.data as Itinerary : i),
          })))
          .catch(onMutationError(''));
        return itinerary;
      },

      updateItinerary(id, data) {
        set((s: GKStore) => ({
          itineraries: s.itineraries.map(i => i.id === id ? { ...i, ...data } : i),
        }));
        const updated = get().itineraries.find(i => i.id === id);
        if (updated) {
          void apiClient.put(`/itineraries/${id}`, updated)
            .then(r => set((s: GKStore) => ({
              itineraries: s.itineraries.map(i => i.id === id ? r.data as Itinerary : i),
            })))
            .catch(onMutationError(''));
        }
      },

      deleteItinerary(id) {
        set((s: GKStore) => ({ itineraries: s.itineraries.filter(i => i.id !== id) }));
      },

      setItineraryStatus(id, status) {
        set((s: GKStore) => ({
          itineraries: s.itineraries.map(i => i.id === id ? { ...i, status } : i),
        }));
        void apiClient.put(`/itineraries/${id}/status`, { status })
          .then(r => set((s: GKStore) => ({
            itineraries: s.itineraries.map(i => i.id === id ? r.data as Itinerary : i),
          })))
          .catch(onMutationError(''));
      },

      // â•â• Voucher Actions â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      createVoucher(data) {
        const state = get();
        const id    = nextVoucherId(state.vouchers.map(v => v.id));
        const voucher: Voucher = {
          id,
          voucherNumber: id,
          tripId:        data.tripId,
          customerId:    data.customerId,
          vendorId:      data.vendorId,
          type:          data.type          ?? 'general',
          status:        'draft',
          issueDate:     data.issueDate,
          customerName:  data.customerName  ?? '',
          customerPhone: data.customerPhone,
          guestNames:    data.guestNames,
          destination:   data.destination,
          hotelName:     data.hotelName,     hotelAddress:   data.hotelAddress,
          hotelPhone:    data.hotelPhone,    checkIn:        data.checkIn,
          checkOut:      data.checkOut,      roomType:       data.roomType,
          mealPlan:      data.mealPlan,      confirmationNo: data.confirmationNo,
          nights:        data.nights,
          pickupPoint:   data.pickupPoint,   dropPoint:      data.dropPoint,
          pickupDate:    data.pickupDate,    pickupTime:     data.pickupTime,
          vehicleType:   data.vehicleType,   driverName:     data.driverName,
          driverPhone:   data.driverPhone,   flightInfo:     data.flightInfo,
          activityName:  data.activityName,  activityDate:   data.activityDate,
          activityTime:  data.activityTime,  activityVenue:  data.activityVenue,
          activityNotes: data.activityNotes,
          airline:       data.airline,       flightNumber:   data.flightNumber,
          pnr:           data.pnr,           departure:      data.departure,
          arrival:       data.arrival,       departureDate:  data.departureDate,
          arrivalDate:   data.arrivalDate,   flightClass:    data.flightClass,
          visaType:      data.visaType,      country:        data.country,
          entryType:     data.entryType,     validity:       data.validity,
          visaFee:       data.visaFee,
          vendorName:    data.vendorName,    vendorPhone:    data.vendorPhone,
          vendorEmail:   data.vendorEmail,
          pax:           data.pax            ?? 1,
          notes:         data.notes,
          emergencyContact: data.emergencyContact,
          internalNotes: data.internalNotes,
          createdDate:   today(),
        };
        set((s: GKStore) => ({ vouchers: [voucher, ...s.vouchers] }));
        void apiClient.post('/vouchers', voucher)
          .then(r => set((s: GKStore) => ({
            vouchers: s.vouchers.map(v => v.id === id ? r.data as Voucher : v),
          })))
          .catch(onMutationError(''));
        return voucher;
      },

      updateVoucher(id, data) {
        set((s: GKStore) => ({
          vouchers: s.vouchers.map(v => v.id === id ? { ...v, ...data } : v),
        }));
        const updated = get().vouchers.find(v => v.id === id);
        if (updated) void apiClient.put(`/vouchers/${id}`, updated)
          .then(r => set((s: GKStore) => ({
            vouchers: s.vouchers.map(v => v.id === id ? r.data as Voucher : v),
          })))
          .catch(onMutationError(''));
      },

      deleteVoucher(id) {
        // Caller handles the API call; this removes from state only
        set((s: GKStore) => ({ vouchers: s.vouchers.filter(v => v.id !== id) }));
      },

      setVoucherStatus(id, status) {
        const issueDate = status === 'issued' ? today() : undefined;
        set((s: GKStore) => ({
          vouchers: s.vouchers.map(v =>
            v.id === id ? { ...v, status, ...(issueDate ? { issueDate } : {}) } : v
          ),
        }));
        void apiClient.put(`/vouchers/${id}/status`, { status })
          .then(r => set((s: GKStore) => ({
            vouchers: s.vouchers.map(v => v.id === id ? r.data as Voucher : v),
          })))
          .catch(onMutationError(''));
      },

      duplicateVoucher(sourceId) {
        const src = get().vouchers.find(v => v.id === sourceId);
        if (!src) return null;
        const id   = nextVoucherId(get().vouchers.map(v => v.id));
        const copy: Voucher = {
          ...src,
          id, voucherNumber: id,
          status: 'draft', issueDate: undefined,
          createdDate: today(),
        };
        set((s: GKStore) => ({ vouchers: [copy, ...s.vouchers] }));
        void apiClient.post(`/vouchers/${sourceId}/duplicate`)
          .then(r => set((s: GKStore) => ({
            vouchers: s.vouchers.map(v => v.id === id ? r.data as Voucher : v),
          })))
          .catch(onMutationError(''));
        return copy;
      },

      // â”€â”€ Utility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

      // ── Receivable Actions ──────────────────────────────────────
      // Standalone Accounts Receivable ledger — independent of the Payment
      // model. totalReceived/balanceDue are cached aggregates recalculated
      // via calcReceivableFinance() on every entry change (mirrors how
      // Booking.financialStatus is always derived, never hand-computed).

      createReceivable(data) {
        const state = get();
        const id    = nextReceivableId(state.receivables.map(r => r.id));
        const now   = today();

        const invoiceAmount = data.invoiceAmount ?? 0;
        const fin = calcReceivableFinance({ invoiceAmount, entries: [], dueDate: data.dueDate });

        const receivable: Receivable = {
          id,
          customerId:    data.customerId,
          customerName:  data.customerName ?? '',
          bookingId:     data.bookingId,
          tripId:        data.tripId,
          invoiceAmount,
          description:   data.description ?? '',
          dueDate:       data.dueDate,
          totalReceived: fin.totalReceived,
          balanceDue:    fin.balanceDue,
          notes:         data.notes ?? '',
          entries:       [],
          createdDate:   now,
        };

        set((s: GKStore) => ({ receivables: [receivable, ...s.receivables] }));

        get().logActivity(
          'receivable_created',
          `Receivable ${id} for ${receivable.customerName} (Rs. ${invoiceAmount}) created`,
          'receivable',
          id,
        );

        void apiClient.post('/receivables', receivable).catch(onMutationError(''));
        return receivable;
      },

      updateReceivable(id, data) {
        set((s: GKStore) => ({
          receivables: s.receivables.map(r => {
            if (r.id !== id) return r;
            const merged = { ...r, ...data };
            const fin = calcReceivableFinance({
              invoiceAmount: merged.invoiceAmount,
              entries:       merged.entries,
              dueDate:       merged.dueDate,
            });
            return { ...merged, totalReceived: fin.totalReceived, balanceDue: fin.balanceDue };
          }),
        }));
        const updated = get().receivables.find(r => r.id === id);
        if (updated) void apiClient.put(`/receivables/${id}`, updated).catch(onMutationError(''));
      },

      deleteReceivable(id) {
        const receivable = get().receivables.find(r => r.id === id);
        set((s: GKStore) => ({ receivables: s.receivables.filter(r => r.id !== id) }));
        if (receivable) {
          get().logActivity(
            'receivable_deleted',
            `Receivable ${id} for ${receivable.customerName} deleted`,
            'receivable',
            id,
          );
        }
        void apiClient.delete(`/receivables/${id}`).catch(onMutationError(''));
      },

      addReceivableEntry(receivableId, entry) {
        const state      = get();
        const receivable = state.receivables.find(r => r.id === receivableId);
        if (!receivable) return null;

        const allEntryIds = state.receivables.flatMap(r => r.entries.map(e => e.id));
        const id  = nextReceivableEntryId(allEntryIds);
        const now = today();

        const newEntry: ReceivableEntry = {
          id,
          receivableId,
          amount:      entry.amount ?? 0,
          paymentDate: entry.paymentDate ?? now,
          paymentMode: entry.paymentMode ?? 'Cash',
          reference:   entry.reference,
          notes:       entry.notes,
        };

        set((s: GKStore) => {
          // Update receivable entries + recalculate totals
          const newReceivables = s.receivables.map(r => {
            if (r.id !== receivableId) return r;
            const entries = [...r.entries, newEntry];
            const fin = calcReceivableFinance({ invoiceAmount: r.invoiceAmount, entries, dueDate: r.dueDate });
            return { ...r, entries, totalReceived: fin.totalReceived, balanceDue: fin.balanceDue };
          });
          // Propagate received total into the linked trip so Trip.paidAmount stays in sync
          const linkedRec = newReceivables.find(r => r.id === receivableId);
          const tripId    = linkedRec?.tripId;
          let newTrips    = s.trips;
          if (tripId) {
            const tripReceived = newReceivables
              .filter(r => r.tripId === tripId)
              .reduce((sum, r) => sum + r.totalReceived, 0);
            newTrips = s.trips.map(t => {
              if (t.id !== tripId) return t;
              const newBalanceDue = Math.max(0, (t.totalPayable ?? 0) - tripReceived);
              return { ...t, paidAmount: tripReceived, balanceDue: newBalanceDue };
            });
          }
          return { receivables: newReceivables, trips: newTrips };
        });

        get().logActivity(
          'receivable_payment_recorded',
          `Payment of Rs. ${newEntry.amount} recorded against receivable ${receivableId} (${receivable.customerName})`,
          'receivable',
          receivableId,
        );

        void apiClient.post(`/receivables/${receivableId}/entries`, newEntry)
          .then(() => {
            const updated = get().receivables.find(r => r.id === receivableId);
            if (updated) return apiClient.put(`/receivables/${receivableId}`, updated);
          })
          .catch(onMutationError(''));
        return newEntry;
      },

      deleteReceivableEntry(receivableId, entryId) {
        set((s: GKStore) => {
          const newReceivables = s.receivables.map(r => {
            if (r.id !== receivableId) return r;
            const entries = r.entries.filter(e => e.id !== entryId);
            const fin = calcReceivableFinance({ invoiceAmount: r.invoiceAmount, entries, dueDate: r.dueDate });
            return { ...r, entries, totalReceived: fin.totalReceived, balanceDue: fin.balanceDue };
          });
          const linkedRec = newReceivables.find(r => r.id === receivableId);
          const tripId    = linkedRec?.tripId;
          let newTrips    = s.trips;
          if (tripId) {
            const tripReceived = newReceivables
              .filter(r => r.tripId === tripId)
              .reduce((sum, r) => sum + r.totalReceived, 0);
            newTrips = s.trips.map(t => {
              if (t.id !== tripId) return t;
              const newBalanceDue = Math.max(0, (t.totalPayable ?? 0) - tripReceived);
              return { ...t, paidAmount: tripReceived, balanceDue: newBalanceDue };
            });
          }
          return { receivables: newReceivables, trips: newTrips };
        });
        void apiClient.delete(`/receivables/${receivableId}/entries/${entryId}`)
          .then(() => {
            const updated = get().receivables.find(r => r.id === receivableId);
            if (updated) return apiClient.put(`/receivables/${receivableId}`, updated);
          })
          .catch(onMutationError(''));
      },

      updateReceivableEntry(receivableId, entryId, data) {
        set((s: GKStore) => {
          const newReceivables = s.receivables.map(r => {
            if (r.id !== receivableId) return r;
            const entries = r.entries.map(e => e.id === entryId ? { ...e, ...data } : e);
            const fin = calcReceivableFinance({ invoiceAmount: r.invoiceAmount, entries, dueDate: r.dueDate });
            return { ...r, entries, totalReceived: fin.totalReceived, balanceDue: fin.balanceDue };
          });
          const linkedRec = newReceivables.find(r => r.id === receivableId);
          const tripId    = linkedRec?.tripId;
          let newTrips    = s.trips;
          if (tripId) {
            const tripReceived = newReceivables
              .filter(r => r.tripId === tripId)
              .reduce((sum, r) => sum + r.totalReceived, 0);
            newTrips = s.trips.map(t => {
              if (t.id !== tripId) return t;
              const newBalanceDue = Math.max(0, (t.totalPayable ?? 0) - tripReceived);
              return { ...t, paidAmount: tripReceived, balanceDue: newBalanceDue };
            });
          }
          return { receivables: newReceivables, trips: newTrips };
        });

        get().logActivity(
          'receivable_payment_updated',
          `Payment entry ${entryId} on receivable ${receivableId} updated`,
          'receivable',
          receivableId,
        );

        void apiClient.put(`/receivables/${receivableId}/entries/${entryId}`, data)
          .then(() => {
            const updated = get().receivables.find(r => r.id === receivableId);
            if (updated) return apiClient.put(`/receivables/${receivableId}`, updated);
          })
          .catch(onMutationError(''));
      },

      // â•â• Invoice Actions (GST) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      async createInvoice(data) {
        try {
          const res = await apiClient.post('/invoices', data);
          const invoice = res.data as Invoice;
          set((s: GKStore) => ({ invoices: [invoice, ...s.invoices] }));
          await get().fetchAll();
          return { ok: true, invoice };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Invoice creation failed') };
        }
      },

      async updateInvoice(id, data) {
        try {
          const res = await apiClient.put(`/invoices/${id}`, data);
          const invoice = res.data as Invoice;
          set((s: GKStore) => ({ invoices: s.invoices.map(i => i.id === id ? invoice : i) }));
          await get().fetchAll();
          return { ok: true, invoice };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Invoice update failed') };
        }
      },

      async cancelInvoice(id, reason) {
        try {
          const res = await apiClient.post(`/invoices/${id}/cancel`, { reason });
          const invoice = res.data as Invoice;
          set((s: GKStore) => ({ invoices: s.invoices.map(i => i.id === id ? invoice : i) }));
          await get().fetchAll();
          return { ok: true, invoice };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Invoice cancellation failed') };
        }
      },

      async deleteInvoice(id) {
        try {
          await apiClient.delete(`/invoices/${id}`);
          set((s: GKStore) => ({ invoices: s.invoices.filter(i => i.id !== id) }));
          await get().fetchAll();
          return { ok: true };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Invoice deletion failed') };
        }
      },

      // â•â• Credit Note Actions (GST) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      async createCreditNote(data) {
        try {
          const res = await apiClient.post('/credit-notes', data);
          const creditNote = res.data as CreditNote;
          set((s: GKStore) => ({ creditNotes: [creditNote, ...s.creditNotes] }));
          await get().fetchAll();
          return { ok: true, creditNote };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Credit note creation failed') };
        }
      },

      async updateCreditNote(id, data) {
        try {
          const res = await apiClient.put(`/credit-notes/${id}`, data);
          const creditNote = res.data as CreditNote;
          set((s: GKStore) => ({ creditNotes: s.creditNotes.map(c => c.id === id ? creditNote : c) }));
          await get().fetchAll();
          return { ok: true, creditNote };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Credit note update failed') };
        }
      },

      async cancelCreditNote(id) {
        try {
          const res = await apiClient.post(`/credit-notes/${id}/cancel`);
          const creditNote = res.data as CreditNote;
          set((s: GKStore) => ({ creditNotes: s.creditNotes.map(c => c.id === id ? creditNote : c) }));
          await get().fetchAll();
          return { ok: true, creditNote };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Credit note cancellation failed') };
        }
      },

      // â•â• Debit Note Actions (GST) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      async createDebitNote(data) {
        try {
          const res = await apiClient.post('/debit-notes', data);
          const debitNote = res.data as DebitNote;
          set((s: GKStore) => ({ debitNotes: [debitNote, ...s.debitNotes] }));
          await get().fetchAll();
          return { ok: true, debitNote };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Debit note creation failed') };
        }
      },

      async updateDebitNote(id, data) {
        try {
          const res = await apiClient.put(`/debit-notes/${id}`, data);
          const debitNote = res.data as DebitNote;
          set((s: GKStore) => ({ debitNotes: s.debitNotes.map(d => d.id === id ? debitNote : d) }));
          await get().fetchAll();
          return { ok: true, debitNote };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Debit note update failed') };
        }
      },

      async cancelDebitNote(id) {
        try {
          const res = await apiClient.post(`/debit-notes/${id}/cancel`);
          const debitNote = res.data as DebitNote;
          set((s: GKStore) => ({ debitNotes: s.debitNotes.map(d => d.id === id ? debitNote : d) }));
          await get().fetchAll();
          return { ok: true, debitNote };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Debit note cancellation failed') };
        }
      },

      // â•â• Company Master â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      async updateCompanySettings(data) {
        try {
          const res = await apiClient.put('/company-settings', data);
          const settings = res.data as CompanySettings;
          set({ companySettings: settings });
          return { ok: true, settings };
        } catch (err: unknown) {
          return { ok: false, reason: getApiErrorMessage(err, 'Company settings update failed') };
        }
      },

      clearAll() {
        set({ ...defaultState, dataLoading: false, dataError: null });
      },

      // â”€â”€ API hydration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      //
      // Retries up to 3 times with exponential back-off (1 s, 2 s, 3 s).
      // Sets dataLoading / dataError so AppShell can show meaningful UI
      // instead of a silent empty screen.
      //
      async fetchAll() {
        set({ dataLoading: true, dataError: null });

        const MAX_ATTEMPTS = 3;
        let lastError: unknown;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const res = await apiClient.get('/data/all');
            const d   = res.data as {
              trips:          Trip[];
              leads:          Lead[];
              customers:      Customer[];
              passengers:     Passenger[];
              bookings:       Booking[];
              tasks:          Task[];
              reminders:      Reminder[];
              activityLog:    ActivityLog[];
              payments:       { customerPayments: Payment[]; supplierPayments: Payment[] };
              vendors:        Vendor[];
              vendorPayments: VendorPayment[];
              quotations:     Quotation[];
              itineraries:    Itinerary[];
              vouchers:       Voucher[];
              receivables:    Receivable[];
              communications: Communication[];
              invoices:        Invoice[];
              creditNotes:     CreditNote[];
              debitNotes:      DebitNote[];
              companySettings: CompanySettings | null;
            };

            set({
              trips:          Array.isArray(d.trips)          ? d.trips          : [],
              leads:          Array.isArray(d.leads)          ? d.leads          : [],
              customers:      Array.isArray(d.customers)      ? d.customers      : [],
              passengers:     Array.isArray(d.passengers)     ? d.passengers     : [],
              bookings:       Array.isArray(d.bookings)       ? d.bookings       : [],
              tasks:          Array.isArray(d.tasks)          ? d.tasks          : [],
              reminders:      Array.isArray(d.reminders)      ? d.reminders      : [],
              activityLog:    Array.isArray(d.activityLog)    ? d.activityLog    : [],
              payments:       d.payments ?? { customerPayments: [], supplierPayments: [] },
              vendors:        Array.isArray(d.vendors)        ? d.vendors        : [],
              vendorPayments: Array.isArray(d.vendorPayments) ? d.vendorPayments : [],
              quotations:     Array.isArray(d.quotations)     ? d.quotations     : [],
              itineraries:    Array.isArray(d.itineraries)    ? d.itineraries    : [],
              vouchers:       Array.isArray(d.vouchers)       ? d.vouchers       : [],
              receivables:    Array.isArray(d.receivables)    ? d.receivables    : [],
              communications: Array.isArray(d.communications) ? d.communications : [],
              invoices:        Array.isArray(d.invoices)        ? d.invoices        : [],
              creditNotes:     Array.isArray(d.creditNotes)     ? d.creditNotes     : [],
              debitNotes:      Array.isArray(d.debitNotes)      ? d.debitNotes      : [],
              companySettings: d.companySettings ?? null,
              dataLoading:    false,
              dataError:      null,
            });

            // Recalculate derived financial fields after hydration
            setTimeout(() => {
              get().recalcAllTrips();
              get().refreshAllReminders();
            }, 0);

            return; // success â€” exit retry loop
          } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            // Don't retry auth errors — the apiClient interceptor already
            // redirects to /login, so retrying here is pointless and slow.
            if (status === 401 || status === 403) {
              set({ dataLoading: false, dataError: null });
              return;
            }
            lastError = err;
            console.warn(`[store] fetchAll attempt ${attempt}/${MAX_ATTEMPTS} failed`, err);
            if (attempt < MAX_ATTEMPTS) {
              await new Promise(r => setTimeout(r, 1000 * attempt));
            }
          }
        }

        // All attempts exhausted
        const msg = getApiErrorMessage(lastError, 'Could not connect to server');

        console.error('[store] fetchAll failed after all retries:', lastError);
        set({ dataLoading: false, dataError: msg });
      },

      async retryFetch() {
        await get().fetchAll();
      },
    })
);

// â”€â”€â”€ Derived selectors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Use these in components instead of computing inline.

export const selectors = {
  tripById:     (id: string) => (s: GKStore) => s.trips.find(t => t.id === id),
  leadById:     (id: string) => (s: GKStore) => s.leads.find(l => l.id === id),
  customerById: (id: string) => (s: GKStore) => s.customers.find(c => c.id === id),
  bookingById:   (id: string) => (s: GKStore) => s.bookings.find(b => b.id === id),
  passengerById: (id: string) => (s: GKStore) => s.passengers.find(p => p.id === id),
  invoiceById:    (id: string) => (s: GKStore) => s.invoices.find(i => i.id === id),
  creditNoteById: (id: string) => (s: GKStore) => s.creditNotes.find(c => c.id === id),
  debitNoteById:  (id: string) => (s: GKStore) => s.debitNotes.find(d => d.id === id),

  passengersForCustomer: (customerId: string) => (s: GKStore) =>
    s.passengers.filter(p => p.customerId === customerId),

  passengersForTrip: (tripId: string) => (s: GKStore) => {
    const trip = s.trips.find(t => t.id === tripId);
    if (!trip) return [] as typeof s.passengers;
    const ids = (trip.passengerIds ?? []) as string[];
    return s.passengers.filter(p => ids.includes(p.id));
  },

  passengersForBooking: (bookingId: string) => (s: GKStore) => {
    const booking = s.bookings.find(b => b.id === bookingId);
    if (!booking) return [] as typeof s.passengers;
    const ids = (booking.passengerIds ?? []) as string[];
    return s.passengers.filter(p => ids.includes(p.id));
  },

  activeTrips:     (s: GKStore) => s.trips.filter(t => ['confirmed', 'in_progress'].includes(t.status)),
  pendingReminders: (s: GKStore) => s.reminders.filter(r => !r.sent),
  openLeads:       (s: GKStore) => s.leads.filter(l => !['converted', 'cancelled'].includes(l.status)),

  tripsByStatus: (status: string) => (s: GKStore) =>
    s.trips.filter(t => t.status === status),

  paymentsForTrip: (tripId: string) => (s: GKStore) => ({
    customer: s.payments.customerPayments.filter(p => p.tripId === tripId),
    supplier: s.payments.supplierPayments.filter(p => p.tripId === tripId),
  }),

  bookingsForTrip: (tripId: string) => (s: GKStore) =>
    s.bookings.filter(b => b.refId === tripId),

  vendorById: (id: string) => (s: GKStore) => s.vendors.find(v => v.id === id),

  vendorPaymentsForVendor: (vendorId: string) => (s: GKStore) =>
    s.vendorPayments.filter(p => p.vendorId === vendorId),

  vendorPaymentsForTrip: (tripId: string) => (s: GKStore) =>
    s.vendorPayments.filter(p => p.tripId === tripId),

  totalVendorOutstanding: (s: GKStore) =>
    s.vendorPayments.filter(p => !p.isPaid).reduce((sum, p) => sum + p.outstanding, 0),

  itineraryById: (id: string) => (s: GKStore) => s.itineraries.find(i => i.id === id),

  itinerariesForTrip: (tripId: string) => (s: GKStore) =>
    s.itineraries.filter(i => i.tripId === tripId),

  itinerariesForQuotation: (quotationId: string) => (s: GKStore) =>
    s.itineraries.filter(i => i.quotationId === quotationId),

  voucherById:    (id: string) => (s: GKStore) => s.vouchers.find(v => v.id === id),

  vouchersForTrip: (tripId: string) => (s: GKStore) =>
    s.vouchers.filter(v => v.tripId === tripId),
};

