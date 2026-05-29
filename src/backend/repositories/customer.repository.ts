import { supabase } from '@/backend/supabase/client';
import { calcRange, throwRepoError, unwrap, unwrapNullable, type PaginatedResult } from './base.repository';
import type { DbCustomer } from '@/backend/supabase/database.types';

const TABLE = 'customers';

export interface CustomerFilters { search?: string; city?: string }

export interface CustomerCreateData {
  name: string; phone: string; alt_phone?: string | null; email?: string | null;
  address?: string | null; city?: string | null; passport_no?: string | null;
  passport_expiry?: string | null; passport_country?: string | null;
  pan_number?: string | null; aadhaar_number?: string | null;
  preferences?: Record<string, unknown>; notes?: string | null; is_active?: boolean;
}

export interface CustomerUpdateData extends Partial<CustomerCreateData> {
  updated_at?: string;
}

class CustomerRepository {

  async findAll(
    orgId:       string,
    filters?:    CustomerFilters,
    pagination?: { page: number; limit: number },
  ): Promise<PaginatedResult<DbCustomer>> {
    let q = supabase.from(TABLE).select('*', { count: 'exact' })
      .eq('org_id', orgId).eq('is_active', true).order('name', { ascending: true });

    if (filters?.search) {
      const t = `%${filters.search}%`;
      q = q.or(`name.ilike.${t},phone.ilike.${t},email.ilike.${t}`);
    }
    if (filters?.city) q = q.eq('city', filters.city);

    if (pagination) {
      const { from, to } = calcRange(pagination.page, pagination.limit);
      q = q.range(from, to);
    }

    const result = await q;
    if (result.error) throwRepoError(TABLE, 'findAll', result.error);
    const data  = Array.isArray(result.data) ? (result.data as DbCustomer[]) : [];
    const total = result.count ?? data.length;
    const limit = pagination?.limit ?? Math.max(total, 1);
    const page  = pagination?.page  ?? 1;
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(orgId: string, id: string): Promise<DbCustomer | null> {
    const r = await supabase.from(TABLE).select('*').eq('org_id', orgId).eq('id', id).single();
    if ((r.error as { code?: string } | null)?.code === 'PGRST116') return null;
    return unwrap<DbCustomer>(r, TABLE, 'findById');
  }

  async findByPhone(orgId: string, phone: string): Promise<DbCustomer | null> {
    const r = await supabase.from(TABLE).select('*').eq('org_id', orgId).eq('phone', phone).maybeSingle();
    return unwrapNullable<DbCustomer>(r, TABLE, 'findByPhone');
  }

  async create(orgId: string, data: CustomerCreateData): Promise<DbCustomer> {
    const r = await supabase.from(TABLE).insert({ ...data, org_id: orgId }).select().single();
    return unwrap<DbCustomer>(r, TABLE, 'create');
  }

  async update(orgId: string, id: string, data: CustomerUpdateData): Promise<DbCustomer> {
    const r = await supabase
      .from(TABLE)
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('org_id', orgId).eq('id', id).select().single();
    return unwrap<DbCustomer>(r, TABLE, 'update');
  }
}

export const customerRepository = new CustomerRepository();
