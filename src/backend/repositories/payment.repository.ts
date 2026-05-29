import { supabase } from '@/backend/supabase/client';
import { throwRepoError, unwrap, unwrapList } from './base.repository';
import type { DbCustomerPayment, DbSupplierPayment } from '@/backend/supabase/database.types';

const CUST = 'customer_payments';
const SUPP = 'supplier_payments';

export interface CustomerPaymentCreateData {
  display_id: string; customer?: string | null; trip_id?: string | null;
  booking_id?: string | null; customer_id?: string | null;
  amount: string; method: string; date?: string; paid_date?: string | null;
  status?: string; reference?: string | null; notes?: string | null;
  created_by_id?: string | null;
}

export interface SupplierPaymentCreateData {
  display_id: string; trip_id?: string | null; booking_id?: string | null;
  supplier?: string | null; amount: string; method: string;
  date?: string; paid_date?: string | null; status?: string;
  reference?: string | null; notes?: string | null;
}

class PaymentRepository {

  async findCustomerPaymentsForTrip(orgId: string, tripId: string): Promise<DbCustomerPayment[]> {
    const r = await supabase.from(CUST).select('*')
      .eq('org_id', orgId).eq('trip_id', tripId).order('date', { ascending: false });
    return unwrapList<DbCustomerPayment>(r, CUST, 'findForTrip');
  }

  async createCustomerPayment(orgId: string, data: CustomerPaymentCreateData): Promise<DbCustomerPayment> {
    const r = await supabase.from(CUST).insert({ ...data, org_id: orgId }).select().single();
    return unwrap<DbCustomerPayment>(r, CUST, 'create');
  }

  async deleteCustomerPayment(orgId: string, id: string): Promise<void> {
    const r = await supabase.from(CUST).delete().eq('org_id', orgId).eq('id', id);
    if (r.error) throwRepoError(CUST, 'delete', r.error);
  }

  async sumCustomerPaymentsForTrip(orgId: string, tripId: string): Promise<number> {
    const r = await supabase.from(CUST).select('amount')
      .eq('org_id', orgId).eq('trip_id', tripId).eq('status', 'RECEIVED');
    if (r.error) throwRepoError(CUST, 'sum', r.error);
    const rows = Array.isArray(r.data) ? r.data as { amount: string }[] : [];
    return rows.reduce((s, p) => s + parseFloat(p.amount), 0);
  }

  async findSupplierPaymentsForTrip(orgId: string, tripId: string): Promise<DbSupplierPayment[]> {
    const r = await supabase.from(SUPP).select('*')
      .eq('org_id', orgId).eq('trip_id', tripId).order('date', { ascending: false });
    return unwrapList<DbSupplierPayment>(r, SUPP, 'findForTrip');
  }

  async createSupplierPayment(orgId: string, data: SupplierPaymentCreateData): Promise<DbSupplierPayment> {
    const r = await supabase.from(SUPP).insert({ ...data, org_id: orgId }).select().single();
    return unwrap<DbSupplierPayment>(r, SUPP, 'create');
  }

  async sumSupplierPaymentsForTrip(orgId: string, tripId: string): Promise<number> {
    const r = await supabase.from(SUPP).select('amount')
      .eq('org_id', orgId).eq('trip_id', tripId).eq('status', 'PAID');
    if (r.error) throwRepoError(SUPP, 'sum', r.error);
    const rows = Array.isArray(r.data) ? r.data as { amount: string }[] : [];
    return rows.reduce((s, p) => s + parseFloat(p.amount), 0);
  }

  async getMonthlyCollected(orgId: string, monthKey: string): Promise<number> {
    const r = await supabase.from(CUST).select('amount')
      .eq('org_id', orgId).eq('status', 'RECEIVED')
      .gte('date', `${monthKey}-01`).lte('date', `${monthKey}-31`);
    if (r.error) throwRepoError(CUST, 'monthlyCollected', r.error);
    const rows = Array.isArray(r.data) ? r.data as { amount: string }[] : [];
    return rows.reduce((s, p) => s + parseFloat(p.amount), 0);
  }
}

export const paymentRepository = new PaymentRepository();
