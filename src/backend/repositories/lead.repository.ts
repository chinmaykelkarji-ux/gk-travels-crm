import { supabase } from '@/backend/supabase/client';
import {
  calcRange, throwRepoError, unwrap, unwrapList,
  type PaginatedResult,
} from './base.repository';
import type { DbLead, LeadStatus, LeadPriority } from '@/backend/supabase/database.types';

const TABLE = 'leads';

export interface LeadFilters {
  status?:       LeadStatus | LeadStatus[];
  priority?:     LeadPriority;
  assignedToId?: string;
  source?:       string;
  search?:       string;
}

export interface LeadCreateData {
  display_id: string; customer_id: string | null; name: string; phone: string;
  email: string | null; source: string; destination: string | null;
  travel_date: string | null; return_date: string | null; pax: number;
  budget: string | null; trip_type: string | null; status: LeadStatus;
  priority: LeadPriority; notes: string | null; follow_up_date: string | null;
  assigned_to_id: string | null; created_by_id: string;
  converted_trip_id: string | null; converted_at: string | null; converted_by_id: string | null;
}

export interface LeadUpdateData {
  name?: string; phone?: string; email?: string | null; source?: string;
  destination?: string | null; travel_date?: string | null; pax?: number;
  budget?: string | null; trip_type?: string | null; status?: LeadStatus;
  priority?: LeadPriority | null; notes?: string | null; follow_up_date?: string | null;
  assigned_to_id?: string | null; converted_trip_id?: string | null;
  converted_at?: string | null; converted_by_id?: string | null; updated_at?: string;
}

class LeadRepository {

  async findAll(
    orgId:       string,
    filters?:    LeadFilters,
    pagination?: { page: number; limit: number },
  ): Promise<PaginatedResult<DbLead>> {
    let q = supabase
      .from(TABLE).select('*', { count: 'exact' })
      .eq('org_id', orgId).order('created_at', { ascending: false });

    if (filters?.status) {
      const list = Array.isArray(filters.status) ? filters.status : [filters.status];
      q = q.in('status', list);
    }
    if (filters?.priority)      q = q.eq('priority',       filters.priority);
    if (filters?.assignedToId)  q = q.eq('assigned_to_id', filters.assignedToId);
    if (filters?.source)        q = q.eq('source',         filters.source);
    if (filters?.search) {
      const t = `%${filters.search}%`;
      q = q.or(`name.ilike.${t},phone.ilike.${t},destination.ilike.${t}`);
    }

    if (pagination) {
      const { from, to } = calcRange(pagination.page, pagination.limit);
      q = q.range(from, to);
    }

    const result = await q;
    if (result.error) throwRepoError(TABLE, 'findAll', result.error);
    const data  = Array.isArray(result.data) ? (result.data as DbLead[]) : [];
    const total = result.count ?? data.length;
    const limit = pagination?.limit ?? Math.max(total, 1);
    const page  = pagination?.page  ?? 1;
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(orgId: string, id: string): Promise<DbLead | null> {
    const r = await supabase.from(TABLE).select('*').eq('org_id', orgId).eq('id', id).single();
    if ((r.error as { code?: string } | null)?.code === 'PGRST116') return null;
    return unwrap<DbLead>(r, TABLE, 'findById');
  }

  async create(orgId: string, data: LeadCreateData): Promise<DbLead> {
    const r = await supabase.from(TABLE).insert({ ...data, org_id: orgId }).select().single();
    return unwrap<DbLead>(r, TABLE, 'create');
  }

  async update(orgId: string, id: string, data: LeadUpdateData): Promise<DbLead> {
    const r = await supabase
      .from(TABLE)
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('org_id', orgId).eq('id', id).select().single();
    return unwrap<DbLead>(r, TABLE, 'update');
  }

  async delete(orgId: string, id: string): Promise<void> {
    const r = await supabase.from(TABLE).delete().eq('org_id', orgId).eq('id', id);
    if (r.error) throwRepoError(TABLE, 'delete', r.error);
  }

  async countByStatus(orgId: string): Promise<Record<LeadStatus, number>> {
    const statuses: LeadStatus[] = ['NEW','CONTACTED','FOLLOW_UP','QUOTATION_SENT','CONFIRMED','CONVERTED','CANCELLED'];
    const results = await Promise.all(
      statuses.map(async s => {
        const { count } = await supabase.from(TABLE)
          .select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', s);
        return [s, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(results) as Record<LeadStatus, number>;
  }

  async markConverted(orgId: string, leadId: string, tripId: string, convertedById: string): Promise<DbLead> {
    return this.update(orgId, leadId, {
      status: 'CONVERTED', converted_trip_id: tripId,
      converted_at: new Date().toISOString(), converted_by_id: convertedById,
    });
  }
}

export const leadRepository = new LeadRepository();
