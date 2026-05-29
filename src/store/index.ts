// ============================================================
// GK TRAVELS CRM — ZUSTAND STORE
//
// Replaces the old window.GKData + window.GKWorkflow globals.
// Stores the same JSON shape in localStorage key "gkcrm_data"
// so existing user data migrates automatically.
//
// Architecture:
//   - Single store, split into typed slices via Zustand
//   - persist() middleware keeps data in localStorage
//   - All financial calculations happen in actions, never in UI
//   - Activity log updated on every mutation
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Trip, Lead, Customer, Booking, Payment, Task, Reminder,
  ActivityLog, Staff, GKStoreState, TripStatus, LeadStatus,
} from '@/shared/types';
import { calcTripFinance, calcBookingFinance } from '@/shared/utils/finance';
import {
  nextTripId, nextLeadId, nextCustomerId, nextBookingId,
  nextTaskId, nextPayId, uid, reminderUid, activityUid,
} from '@/shared/utils/id';
import { today } from '@/shared/utils/date';
import { canConfirmTrip } from '@/shared/schemas/trip';

// ─── Defaults ────────────────────────────────────────────────

const defaultStaff: Staff[] = [
  { id: 1, name: 'Priya Singh',  role: 'Senior Operations', trips: 0, tasks: 0, avatar: 'PS' },
  { id: 2, name: 'Arjun Patel',  role: 'Operations',        trips: 0, tasks: 0, avatar: 'AP' },
  { id: 3, name: 'Deepak Verma', role: 'Operations',        trips: 0, tasks: 0, avatar: 'DV' },
];

const defaultState: GKStoreState = {
  trips:       [],
  leads:       [],
  customers:   [],
  bookings:    [],
  tasks:       [],
  reminders:   [],
  activityLog: [],
  payments:    { customerPayments: [], supplierPayments: [] },
  staff:       defaultStaff,
};

// ─── Store Actions Interface ──────────────────────────────────

interface StoreActions {
  // ── Trips ───────────────────────────────────────────────
  createTrip:  (data: Partial<Trip>) => Trip;
  updateTrip:  (id: string, data: Partial<Trip>) => void;
  deleteTrip:  (id: string) => void;
  setTripStatus: (id: string, status: TripStatus) => { ok: boolean; reason?: string };
  recalcTripFinance: (tripId: string) => void;
  recalcAllTrips:    () => void;

  // ── Leads ───────────────────────────────────────────────
  createLead:     (data: Partial<Lead>) => Lead;
  updateLead:     (id: string, data: Partial<Lead>) => void;
  deleteLead:     (id: string) => void;
  setLeadStatus:  (id: string, status: LeadStatus) => void;
  convertLead:    (leadId: string) => { ok: boolean; trip?: Trip; reason?: string };

  // ── Customers ───────────────────────────────────────────
  createCustomer: (data: Partial<Customer>) => Customer;
  updateCustomer: (id: string, data: Partial<Customer>) => void;

  // ── Bookings ────────────────────────────────────────────
  createBooking:  (data: Partial<Booking>) => Booking;
  updateBooking:  (id: string, data: Partial<Booking>) => void;
  deleteBooking:  (id: string) => void;

  // ── Payments ────────────────────────────────────────────
  recordPayment:  (payment: Partial<Payment> & { type: 'customer' | 'supplier' }) => Payment;
  deletePayment:  (id: string, type: 'customer' | 'supplier') => void;

  // ── Tasks ───────────────────────────────────────────────
  createTask:     (data: Partial<Task>) => Task;
  updateTask:     (id: string, data: Partial<Task>) => void;
  completeTask:   (id: string) => void;

  // ── Reminders ───────────────────────────────────────────
  refreshAllReminders: () => void;
  markReminderSent:    (id: string) => void;

  // ── Activity Log ────────────────────────────────────────
  logActivity: (
    type: string,
    message: string,
    entityType: ActivityLog['entityType'],
    entityId: string,
    meta?: { before?: unknown; after?: unknown },
  ) => void;

  // ── Utility ─────────────────────────────────────────────
  clearAll: () => void;
}

type GKStore = GKStoreState & StoreActions;

// ─── Helper: compute supplier totals for a trip ──────────────

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

// ─── Store Creation ──────────────────────────────────────────

export const useStore = create<GKStore>()(
  persist(
    (set, get) => ({
      ...defaultState,

      // ══ Trip Actions ════════════════════════════════════════

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
              event: `Trip created — ${data.destination}`,
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
          gstAmount:   fin.gstAmount,
          totalPayable: fin.totalPayable,
          paidAmount:  fin.paidAmount,
          balanceDue:  fin.balanceDue,
          supplierCost: fin.supplierCost,
          grossMargin: fin.grossMargin,
          marginPct:   fin.marginPct,
        });

        set(s => ({
          trips:       [trip, ...s.trips],
          activityLog: [
            {
              id:         activityUid(),
              type:       'trip_created',
              message:    `Trip ${id} created for ${trip.customer} → ${trip.destination}`,
              entityType: 'trip',
              entityId:   id,
              timestamp:  new Date().toISOString(),
              date:       now,
            },
            ...s.activityLog,
          ].slice(0, 500),
        }));

        // Auto-generate reminders
        get().refreshAllReminders();
        return trip;
      },

      updateTrip(id, data) {
        set(s => ({
          trips: s.trips.map(t => {
            if (t.id !== id) return t;
            const updated = { ...t, ...data };
            const totals  = supplierTotalsForTrip(s, id);
            const fin     = calcTripFinance({ ...updated, ...totals });
            return {
              ...updated,
              gstAmount:   fin.gstAmount,
              totalPayable: fin.totalPayable,
              paidAmount:  fin.paidAmount,
              balanceDue:  fin.balanceDue,
              supplierCost: fin.supplierCost,
              grossMargin: fin.grossMargin,
              marginPct:   fin.marginPct,
            };
          }),
        }));
        get().refreshAllReminders();
      },

      deleteTrip(id) {
        set(s => ({ trips: s.trips.filter(t => t.id !== id) }));
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
        get().logActivity('status_change', `Trip ${id} status → ${status}`, 'trip', id);
        return { ok: true };
      },

      recalcTripFinance(tripId) {
        set(s => ({
          trips: s.trips.map(t => {
            if (t.id !== tripId) return t;
            const totals = supplierTotalsForTrip(s, tripId);
            const fin    = calcTripFinance({ ...t, ...totals });
            return {
              ...t,
              gstAmount:   fin.gstAmount,
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
        set(s => ({
          trips: s.trips.map(t => {
            const totals = supplierTotalsForTrip(s, t.id);
            const fin    = calcTripFinance({ ...t, ...totals });
            return {
              ...t,
              gstAmount:   fin.gstAmount,
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

      // ══ Lead Actions ════════════════════════════════════════

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

        set(s => ({
          leads:       [lead, ...s.leads],
          activityLog: [
            {
              id:         activityUid(),
              type:       'lead_created',
              message:    `Lead ${id} created — ${lead.name} (${lead.source})`,
              entityType: 'lead',
              entityId:   id,
              timestamp:  new Date().toISOString(),
              date:       now,
            },
            ...s.activityLog,
          ].slice(0, 500),
        }));
        return lead;
      },

      updateLead(id, data) {
        set(s => ({
          leads: s.leads.map(l => l.id === id ? { ...l, ...data } : l),
        }));
      },

      deleteLead(id) {
        set(s => ({ leads: s.leads.filter(l => l.id !== id) }));
      },

      setLeadStatus(id, status) {
        const lead = get().leads.find(l => l.id === id);
        if (!lead) return;
        get().updateLead(id, {
          status,
          timeline: [
            ...(lead.timeline || []),
            { id: uid(), date: today(), event: `Status → ${status}`, type: 'system' },
          ],
        });
        get().logActivity('lead_status', `Lead ${id} status → ${status}`, 'lead', id);
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

        // Link customer → trip
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
          `Lead ${leadId} converted → Trip ${trip.id}`,
          'lead',
          leadId,
        );

        return { ok: true, trip };
      },

      // ══ Customer Actions ════════════════════════════════════

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
        set(s => ({ customers: [cust, ...s.customers] }));
        return cust;
      },

      updateCustomer(id, data) {
        set(s => ({
          customers: s.customers.map(c => c.id === id ? { ...c, ...data } : c),
        }));
      },

      // ══ Booking Actions ═════════════════════════════════════

      createBooking(data) {
        const state = get();
        const id    = nextBookingId(state.bookings.map(b => b.id));
        const fin   = calcBookingFinance({
          sellingPrice: data.sellingPrice ?? null,
          gstRate:      data.gstRate      ?? 0,
          advance:      data.advance      ?? 0,
          supplierCost: data.supplierCost ?? 0,
          supplierPaid: data.supplierPaid ?? 0,
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
        set(s => ({ bookings: [booking, ...s.bookings] }));
        // Recalc linked trip
        if (booking.refId) get().recalcTripFinance(booking.refId);
        return booking;
      },

      updateBooking(id, data) {
        set(s => ({
          bookings: s.bookings.map(b => {
            if (b.id !== id) return b;
            const updated = { ...b, ...data };
            const fin     = calcBookingFinance(updated);
            return { ...updated, ...fin };
          }),
        }));
        const booking = get().bookings.find(b => b.id === id);
        if (booking?.refId) get().recalcTripFinance(booking.refId);
      },

      deleteBooking(id) {
        const booking = get().bookings.find(b => b.id === id);
        set(s => ({ bookings: s.bookings.filter(b => b.id !== id) }));
        if (booking?.refId) get().recalcTripFinance(booking.refId);
      },

      // ══ Payment Actions ═════════════════════════════════════

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

        set(s => {
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
          `${isCustomer ? 'Customer' : 'Supplier'} payment ₹${payment.amount} recorded`,
          'payment',
          payment.tripId || payment.bookingId || id,
        );

        return payment;
      },

      deletePayment(id, type) {
        const state = get();
        const list  = type === 'customer' ? state.payments.customerPayments : state.payments.supplierPayments;
        const pay   = list.find(p => p.id === id);
        set(s => {
          const payments = { ...s.payments };
          if (type === 'customer') {
            payments.customerPayments = s.payments.customerPayments.filter(p => p.id !== id);
          } else {
            payments.supplierPayments = s.payments.supplierPayments.filter(p => p.id !== id);
          }
          return { payments };
        });
        if (pay?.tripId) get().recalcTripFinance(pay.tripId);
      },

      // ══ Task Actions ════════════════════════════════════════

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
        set(s => ({ tasks: [task, ...s.tasks] }));
        return task;
      },

      updateTask(id, data) {
        set(s => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, ...data } : t) }));
      },

      completeTask(id) {
        get().updateTask(id, { status: 'completed', completedDate: today() });
      },

      // ══ Reminder Actions ════════════════════════════════════

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
              message: `Web check-in for ${trip.customer} — ${daysLeft === 0 ? 'today' : 'tomorrow'} (${trip.departure})`,
              dueDate: trip.departure, sent: false,
            });
          }
          if (daysLeft >= 0 && daysLeft <= 3 && (trip.balanceDue ?? 0) > 0) {
            newReminders.push({
              id: reminderUid(), tripId: trip.id,
              type: 'balance_payment', priority: 'urgent',
              message: `Balance ₹${trip.balanceDue} due from ${trip.customer} — departing in ${daysLeft}d`,
              dueDate: trip.departure, sent: false,
            });
          } else if (daysLeft > 3 && daysLeft <= 7 && (trip.balanceDue ?? 0) > 0) {
            newReminders.push({
              id: reminderUid(), tripId: trip.id,
              type: 'balance_payment', priority: 'high',
              message: `Balance ₹${trip.balanceDue} pending — ${trip.customer} (${trip.destination})`,
              dueDate: trip.departure, sent: false,
            });
          }
          if (trip.visaStatus === 'submitted') {
            newReminders.push({
              id: reminderUid(), tripId: trip.id,
              type: 'visa_followup', priority: 'medium',
              message: `Follow up visa status for ${trip.customer} — ${trip.destination}`,
              dueDate: trip.departure, sent: false,
            });
          }
          if (daysLeft >= 0 && daysLeft <= 3) {
            newReminders.push({
              id: reminderUid(), tripId: trip.id,
              type: 'final_documents', priority: 'high',
              message: `Send final documents to ${trip.customer} — departing in ${daysLeft}d to ${trip.destination}`,
              dueDate: trip.departure, sent: false,
            });
          }
        }

        // Preserve manually sent reminders
        const preserved = state.reminders.filter(r => r.sent);
        set({ reminders: [...preserved, ...newReminders].slice(0, 300) });
      },

      markReminderSent(id) {
        set(s => ({
          reminders: s.reminders.map(r =>
            r.id === id ? { ...r, sent: true, sentAt: new Date().toISOString() } : r
          ),
        }));
      },

      // ══ Activity Log ════════════════════════════════════════

      logActivity(type, message, entityType, entityId, meta) {
        const entry: ActivityLog = {
          id:         activityUid(),
          type,       message, entityType, entityId,
          timestamp:  new Date().toISOString(),
          date:       today(),
          before:     meta?.before,
          after:      meta?.after,
        };
        set(s => ({
          activityLog: [entry, ...s.activityLog].slice(0, 500),
        }));
      },

      // ── Utility ────────────────────────────────────────────

      clearAll() {
        set(defaultState);
      },
    }),
    {
      name:    'gkcrm_data',  // Same key as legacy app for seamless migration
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        trips:       state.trips,
        leads:       state.leads,
        customers:   state.customers,
        bookings:    state.bookings,
        tasks:       state.tasks,
        reminders:   state.reminders,
        activityLog: state.activityLog,
        payments:    state.payments,
        staff:       state.staff,
      }),
      // After hydrating from localStorage, recalc all trip finances
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.recalcAllTrips();
          state.refreshAllReminders();
        }
      },
    },
  ),
);

// ─── Derived selectors ────────────────────────────────────────
// Use these in components instead of computing inline.

export const selectors = {
  tripById:     (id: string) => (s: GKStore) => s.trips.find(t => t.id === id),
  leadById:     (id: string) => (s: GKStore) => s.leads.find(l => l.id === id),
  customerById: (id: string) => (s: GKStore) => s.customers.find(c => c.id === id),
  bookingById:  (id: string) => (s: GKStore) => s.bookings.find(b => b.id === id),

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
};
