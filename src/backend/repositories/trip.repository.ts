// ============================================================
// GK TRAVELS CRM — Trip Repository
// Supabase client is untyped — type safety is at method boundaries.
// ============================================================

import { supabase } from '@/backend/supabase/client';
import {
  calcRange, throwRepoError, unwrap, unwrapNullable, unwrapList,
  type PaginatedResult,
} from './base.repository';
import type { DbTrip, TripStatus } from '@/backend/supabase/database.types';
import { calcTripFinance } from '@/shared/utils/finance';

const TABLE = 'trips';

export interface TripFilters {
  status?:        TripStatus | TripStatus[];
  customerId?:    string;
  assignedToId?:  string;
  search?:        string;
  departureFrom?: string;
  departureTo?:   string;
}

export interface TripSort {
  column:    'departure' | 'created_at' | 'customer' | 'balance_due';
  direction: 'asc' | 'desc';
}

export interface TripCreateData {
  display_id: string; customer_id: string | null; customer: string; phone: string;
  email: string | null; destination: string; type: string; pax: number;
  departure: string | null; return_date: string | null; status: TripStatus;
  total_amount: string | null; gst_rate: string; discount: string | null;
  gst_amount: string; total_payable: string | null; paid_amount: string;
  balance_due: string; supplier_cost: string; gross_margin: string; margin_pct: string;
  visa_status: string; hotel_status: string; flight_status: string; check_in_status: string;
  notes: string | null; assigned_to_id: string | null; created_by_id: string;
  source_lead_id: string | null; converted_at: string | null; converted_by_id: string | null;
}

export interface TripUpdateData {
  status?: TripStatus; customer?: string; phone?: string; email?: string | null;
  destination?: string; type?: string; pax?: number; departure?: string | null;
  return_date?: string | null; total_amount?: string | null; gst_rate?: string;
  discount?: string | null; gst_amount?: string; total_payable?: string | null;
  paid_amount?: string; balance_due?: string; supplier_cost?: string;
  gross_margin?: string; margin_pct?: string; visa_status?: string;
  hotel_status?: string; flight_status?: string; check_in_status?: string;
  notes?: string | null; assigned_to_id?: string | null; customer_id?: string | null;
  updated_at?: string;
}

class TripRepository {

  async findAll(
    orgId:       string,
    filters?:    TripFilters,
    sort?:       TripSort,
    pagination?: { page: number; limit: number },
  ): Promise<PaginatedResult<DbTrip>> {
    let q = supabase.from(TABLE).select('*', { count: 'exact' }).eq('org_id', orgId);

    if (filters?.status) {
      const list = Array.isArray(filters.status) ? filters.status : [filters.status];
      q = q.in('status', list);
    }
    if (filters?.customerId)    q = q.eq('customer_id',    filters.customerId);
    if (filters?.assignedToId)  q = q.eq('assigned_to_id', filters.assignedToId);
    if (filters?.departureFrom) q = q.gte('departure',     filters.departureFrom);
    if (filters?.departureTo)   q = q.lte('departure',     filters.departureTo);
    if (filters?.search) {
      const t = `%${filters.search}%`;
      q = q.or(`customer.ilike.${t},destination.ilike.${t},display_id.ilike.${t}`);
    }

    const s = sort ?? { column: 'created_at', direction: 'desc' };
    q = q.order(s.column, { ascending: s.direction === 'asc' });

    if (pagination) {
      const { from, to } = calcRange(pagination.page, pagination.limit);
      q = q.range(from, to);
    }

    const result = await q;
    if (result.error) throwRepoError(TABLE, 'findAll', result.error);
    const data  = Array.isArray(result.data) ? (result.data as DbTrip[]) : [];
    const total = result.count ?? data.length;
    const limit = pagination?.limit ?? Math.max(total, 1);
    const page  = pagination?.page  ?? 1;
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(orgId: string, id: string): Promise<DbTrip | null> {
    const r = await supabase.from(TABLE).select('*').eq('org_id', orgId).eq('id', id).single();
    if ((r.error as { code?: string } | null)?.code === 'PGRST116') return null;
    return unwrap<DbTrip>(r, TABLE, 'findById');
  }

  async findByDisplayId(orgId: string, displayId: string): Promise<DbTrip | null> {
    const r = await supabase
      .from(TABLE).select('*').eq('org_id', orgId).eq('display_id', displayId).maybeSingle();
    return unwrapNullable<DbTrip>(r, TABLE, 'findByDisplayId');
  }

  async create(orgId: string, data: TripCreateData): Promise<DbTrip> {
    const r = await supabase
      .from(TABLE).insert({ ...data, org_id: orgId }).select().single();
    return unwrap<DbTrip>(r, TABLE, 'create');
  }

  async update(orgId: string, id: string, data: TripUpdateData): Promise<DbTrip> {
    const r = await supabase
      .from(TABLE)
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('org_id', orgId).eq('id', id).select().single();
    return unwrap<DbTrip>(r, TABLE, 'update');
  }

  async delete(orgId: string, id: string): Promise<void> {
    const r = await supabase.from(TABLE).delete().eq('org_id', orgId).eq('id', id);
    if (r.error) throwRepoError(TABLE, 'delete', r.error);
  }

  async countByStatus(orgId: string): Promise<Record<TripStatus, number>> {
    const statuses: TripStatus[] = ['DRAFT','QUOTATION','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED'];
    const results = await Promise.all(
      statuses.map(async s => {
        const { count } = await supabase
          .from(TABLE).select('*', { count: 'exact', head: true })
          .eq('org_id', orgId).eq('status', s);
        return [s, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(results) as Record<TripStatus, number>;
  }

  async findDepartingWithin(orgId: string, days: number): Promise<DbTrip[]> {
    const now  = new Date();
    const from = now.toISOString().split('T')[0];
    const to   = new Date(now.getTime() + days * 86_400_000).toISOString().split('T')[0];
    const r = await supabase.from(TABLE).select('*')
      .eq('org_id', orgId).neq('status', 'CANCELLED')
      .gte('departure', from).lte('departure', to)
      .order('departure', { ascending: true });
    return unwrapList<DbTrip>(r, TABLE, 'findDepartingWithin');
  }

  async updateFinancialCache(
    orgId: string, tripId: string,
    customerPaymentsTotal: number,
    supplierPaymentsTotal: number,
    bookingSupplierTotal:  number,
  ): Promise<DbTrip> {
    const trip = await this.findById(orgId, tripId);
    if (!trip) throwRepoError(TABLE, 'updateFinancialCache', new Error('Trip not found'));

    const fin = calcTripFinance({
      totalAmount:           trip!.total_amount  ? parseFloat(trip!.total_amount)  : null,
      gstRate:               trip!.gst_rate      ? parseFloat(trip!.gst_rate)      : 5,
      paidAmount:            trip!.paid_amount   ? parseFloat(trip!.paid_amount)   : 0,
      customerPaymentsTotal,
      supplierPaymentsTotal,
      bookingSupplierTotal,
    });

    return this.update(orgId, tripId, {
      gst_amount:    String(fin.gstAmount),
      total_payable: fin.totalPayable !== null ? String(fin.totalPayable) : null,
      paid_amount:   String(fin.paidAmount),
      balance_due:   String(fin.balanceDue),
      supplier_cost: String(fin.supplierCost),
      gross_margin:  String(fin.grossMargin),
      margin_pct:    String(fin.marginPct),
    });
  }
}

export const tripRepository = new TripRepository();
