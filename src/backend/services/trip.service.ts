// ============================================================
// GK TRAVELS CRM — Trip Service
// Business logic for trip operations.
// ============================================================

import { supabase } from '@/backend/supabase/client';
import { tripRepository, type TripFilters, type TripSort, type TripCreateData } from '@/backend/repositories/trip.repository';
import { leadRepository } from '@/backend/repositories/lead.repository';
import { customerRepository } from '@/backend/repositories/customer.repository';
import { paymentRepository } from '@/backend/repositories/payment.repository';
import { activityRepository } from '@/backend/repositories/activity.repository';
import { canConfirmTrip } from '@/shared/schemas/trip';
import type { DbTrip, DbLead, TripStatus } from '@/backend/supabase/database.types';
import type { PaginatedResult } from '@/backend/repositories/base.repository';

// ─── Input shapes ────────────────────────────────────────────

export interface CreateTripInput {
  customer:      string;
  phone:         string;
  email?:        string;
  destination:   string;
  type:          string;
  pax:           number;
  departure?:    string | null;
  returnDate?:   string | null;
  totalAmount?:  number | null;
  gstRate?:      number;
  notes?:        string;
  assignedToId?: string;
  sourceLeadId?: string;
}

export interface UpdateTripInput {
  customer?:      string;
  phone?:         string;
  destination?:   string;
  type?:          string;
  pax?:           number;
  departure?:     string | null;
  returnDate?:    string | null;
  totalAmount?:   number | null;
  gstRate?:       number;
  discount?:      number | null;
  notes?:         string;
  assignedToId?:  string;
  visaStatus?:    string;
  hotelStatus?:   string;
  flightStatus?:  string;
  checkInStatus?: string;
}

// ─── Service ─────────────────────────────────────────────────

class TripService {

  async list(
    orgId:       string,
    filters?:    TripFilters,
    sort?:       TripSort,
    pagination?: { page: number; limit: number },
  ): Promise<PaginatedResult<DbTrip>> {
    return tripRepository.findAll(orgId, filters, sort, pagination);
  }

  async get(orgId: string, id: string): Promise<DbTrip | null> {
    return tripRepository.findById(orgId, id);
  }

  async create(
    orgId:       string,
    input:       CreateTripInput,
    createdById: string,
  ): Promise<DbTrip> {
    const displayId = await this.nextDisplayId(orgId);

    const createData: TripCreateData = {
      display_id:      displayId,
      customer_id:     null,
      customer:        input.customer,
      phone:           input.phone,
      email:           input.email        ?? null,
      destination:     input.destination,
      type:            input.type,
      pax:             input.pax,
      departure:       input.departure    ?? null,
      return_date:     input.returnDate   ?? null,
      status:          'DRAFT',
      total_amount:    input.totalAmount != null ? String(input.totalAmount) : null,
      gst_rate:        String(input.gstRate ?? 5),
      discount:        null,
      gst_amount:      '0',
      total_payable:   null,
      paid_amount:     '0',
      balance_due:     '0',
      supplier_cost:   '0',
      gross_margin:    '0',
      margin_pct:      '0',
      visa_status:     'pending',
      hotel_status:    'pending',
      flight_status:   'pending',
      check_in_status: 'not_due',
      notes:           input.notes         ?? null,
      assigned_to_id:  input.assignedToId  ?? null,
      created_by_id:   createdById,
      source_lead_id:  input.sourceLeadId  ?? null,
      converted_at:    null,
      converted_by_id: null,
    };
    const trip = await tripRepository.create(orgId, createData);

    await this.recalcFinancials(orgId, trip.id);

    await activityRepository.log(
      orgId, 'trip_created',
      `Trip ${displayId} created — ${input.destination}`,
      'trip', trip.id, { userId: createdById },
    );

    return trip;
  }

  async update(
    orgId:       string,
    id:          string,
    input:       UpdateTripInput,
    updatedById: string,
  ): Promise<DbTrip> {
    const patch: Record<string, string | number | null> = {};
    if (input.customer     !== undefined) patch.customer         = input.customer;
    if (input.phone        !== undefined) patch.phone            = input.phone;
    if (input.destination  !== undefined) patch.destination      = input.destination;
    if (input.type         !== undefined) patch.type             = input.type;
    if (input.pax          !== undefined) patch.pax              = input.pax;
    if (input.departure    !== undefined) patch.departure        = input.departure;
    if (input.returnDate   !== undefined) patch.return_date      = input.returnDate;
    if (input.totalAmount  !== undefined) patch.total_amount     = input.totalAmount != null ? String(input.totalAmount) : null;
    if (input.gstRate      !== undefined) patch.gst_rate         = String(input.gstRate);
    if (input.discount     !== undefined) patch.discount         = input.discount != null ? String(input.discount) : null;
    if (input.notes        !== undefined) patch.notes            = input.notes;
    if (input.assignedToId !== undefined) patch.assigned_to_id  = input.assignedToId;
    if (input.visaStatus   !== undefined) patch.visa_status      = input.visaStatus;
    if (input.hotelStatus  !== undefined) patch.hotel_status     = input.hotelStatus;
    if (input.flightStatus !== undefined) patch.flight_status    = input.flightStatus;
    if (input.checkInStatus !== undefined) patch.check_in_status = input.checkInStatus;

    const trip = await tripRepository.update(orgId, id, patch);

    if (input.totalAmount !== undefined || input.gstRate !== undefined || input.discount !== undefined) {
      await this.recalcFinancials(orgId, id);
    }

    await activityRepository.log(orgId, 'trip_updated', 'Trip updated', 'trip', id, { userId: updatedById });
    return trip;
  }

  async setStatus(
    orgId:   string,
    id:      string,
    status:  TripStatus,
    userId:  string,
  ): Promise<{ ok: boolean; reason?: string; trip?: DbTrip }> {
    const trip = await tripRepository.findById(orgId, id);
    if (!trip) return { ok: false, reason: 'Trip not found' };

    if (status === 'CONFIRMED') {
      const check = canConfirmTrip({
        totalAmount: trip.total_amount ? parseFloat(trip.total_amount) : null,
        departure:   trip.departure,
        pax:         trip.pax,
      });
      if (!check.ok) return { ok: false, reason: check.reason };
    }

    const updated = await tripRepository.update(orgId, id, { status });
    await activityRepository.log(
      orgId, 'status_change', `Trip status → ${status}`,
      'trip', id, { userId, before: trip.status, after: status },
    );
    return { ok: true, trip: updated };
  }

  async delete(orgId: string, id: string, userId: string): Promise<void> {
    // Fetch before deleting for the audit log
    const trip    = await tripRepository.findById(orgId, id);
    const label   = trip?.display_id ?? id;
    await tripRepository.delete(orgId, id);
    await activityRepository.log(
      orgId, 'trip_deleted', `Trip ${label} deleted`,
      'trip', id, { userId },
    );
  }

  async convertFromLead(
    orgId:  string,
    lead:   DbLead,
    userId: string,
  ): Promise<DbTrip> {
    let customer = lead.customer_id
      ? await customerRepository.findById(orgId, lead.customer_id)
      : await customerRepository.findByPhone(orgId, lead.phone);

    if (!customer) {
      customer = await customerRepository.create(orgId, {
        name:             lead.name,
        phone:            lead.phone,
        email:            lead.email   ?? null,
        alt_phone:        null,
        address:          null,
        city:             null,
        passport_no:      null,
        passport_expiry:  null,
        passport_country: null,
        pan_number:       null,
        aadhaar_number:   null,
        preferences:      {},
        notes:            null,
        is_active:        true,
      });
    }

    const trip = await this.create(
      orgId,
      {
        customer:    lead.name,
        phone:       lead.phone,
        email:       lead.email       ?? undefined,
        destination: lead.destination ?? '',
        type:        lead.trip_type   ?? 'Leisure',
        pax:         lead.pax,
        departure:   lead.travel_date ?? null,
        totalAmount: lead.budget      ? parseFloat(lead.budget) : null,
        notes:       lead.notes       ?? undefined,
        sourceLeadId: lead.id,
      },
      userId,
    );

    // Link customer to the newly created trip
    await tripRepository.update(orgId, trip.id, { customer_id: customer.id });

    await leadRepository.markConverted(orgId, lead.id, trip.id, userId);

    await activityRepository.log(
      orgId, 'lead_converted',
      `Lead ${lead.display_id} converted → Trip ${trip.display_id}`,
      'lead', lead.id, { userId },
    );

    return trip;
  }

  async recalcFinancials(orgId: string, tripId: string): Promise<void> {
    const [custTotal, suppTotal] = await Promise.all([
      paymentRepository.sumCustomerPaymentsForTrip(orgId, tripId),
      paymentRepository.sumSupplierPaymentsForTrip(orgId, tripId),
    ]);
    await tripRepository.updateFinancialCache(orgId, tripId, custTotal, suppTotal, 0);
  }

  // ── Generate next display ID — uses supabase directly ───────
  // Never access `repository['supabase']` (protected member).

  private async nextDisplayId(orgId: string): Promise<string> {
    const year = new Date().getFullYear();
    const { data } = await supabase
      .from('trips')
      .select('display_id')
      .eq('org_id', orgId)
      .ilike('display_id', `GK-${year}-%`)
      .order('display_id', { ascending: false })
      .limit(1);

    // Supabase returns unknown[] without the Database generic — cast row explicitly
    const rows = Array.isArray(data) ? data as { display_id: string }[] : [];
    const last  = rows[0]?.display_id ?? null;
    const seq   = last
      ? parseInt(last.split('-')[2] ?? '0', 10) + 1
      : 1;
    return `GK-${year}-${String(seq).padStart(4, '0')}`;
  }
}

export const tripService = new TripService();
