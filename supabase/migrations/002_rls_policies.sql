-- ============================================================
-- GK TRAVELS CRM — Row Level Security Policies
--
-- CRITICAL: All tables use RLS to enforce multi-tenancy.
-- Users can ONLY access data from their own organisation.
-- This is the database-level enforcement (not just frontend).
--
-- Apply AFTER 001_initial_schema.sql
-- ============================================================

-- ─── Helper function: get current user's org ─────────────────

CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS TEXT AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid()::text
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── Enable RLS on all tables ────────────────────────────────

ALTER TABLE organisations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips              ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_timeline      ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents          ENABLE ROW LEVEL SECURITY;

-- ─── Organisations ────────────────────────────────────────────

CREATE POLICY "users_see_own_org" ON organisations
  FOR SELECT USING (id = auth_org_id());

-- Only super admins can update org settings
CREATE POLICY "admins_update_org" ON organisations
  FOR UPDATE USING (
    id = auth_org_id() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()::text AND role IN ('SUPER_ADMIN', 'ADMIN'))
  );

-- ─── Profiles ────────────────────────────────────────────────

CREATE POLICY "users_see_own_org_profiles" ON profiles
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE USING (id = auth.uid()::text);

CREATE POLICY "admins_manage_profiles" ON profiles
  FOR ALL USING (
    org_id = auth_org_id() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()::text AND role IN ('SUPER_ADMIN', 'ADMIN'))
  );

-- ─── Customers ───────────────────────────────────────────────

CREATE POLICY "org_members_see_customers" ON customers
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "org_members_insert_customers" ON customers
  FOR INSERT WITH CHECK (org_id = auth_org_id());

CREATE POLICY "org_members_update_customers" ON customers
  FOR UPDATE USING (org_id = auth_org_id());

CREATE POLICY "admins_delete_customers" ON customers
  FOR DELETE USING (
    org_id = auth_org_id() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()::text AND role IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER'))
  );

-- ─── Leads ────────────────────────────────────────────────────

CREATE POLICY "org_members_see_leads" ON leads
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "org_members_insert_leads" ON leads
  FOR INSERT WITH CHECK (org_id = auth_org_id());

CREATE POLICY "org_members_update_leads" ON leads
  FOR UPDATE USING (org_id = auth_org_id());

CREATE POLICY "managers_delete_leads" ON leads
  FOR DELETE USING (
    org_id = auth_org_id() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()::text AND role IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER'))
  );

-- ─── Trips ────────────────────────────────────────────────────

CREATE POLICY "org_members_see_trips" ON trips
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "org_members_insert_trips" ON trips
  FOR INSERT WITH CHECK (org_id = auth_org_id());

CREATE POLICY "org_members_update_trips" ON trips
  FOR UPDATE USING (org_id = auth_org_id());

-- Finance staff cannot delete trips
CREATE POLICY "non_finance_delete_trips" ON trips
  FOR DELETE USING (
    org_id = auth_org_id() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()::text AND role IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER')
    )
  );

-- ─── Bookings ─────────────────────────────────────────────────

CREATE POLICY "org_bookings_select" ON bookings
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "org_bookings_insert" ON bookings
  FOR INSERT WITH CHECK (org_id = auth_org_id());

CREATE POLICY "org_bookings_update" ON bookings
  FOR UPDATE USING (org_id = auth_org_id());

CREATE POLICY "managers_delete_bookings" ON bookings
  FOR DELETE USING (
    org_id = auth_org_id() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()::text AND role IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER'))
  );

-- ─── Payments — restricted to ADMIN+ for delete ──────────────

CREATE POLICY "org_cust_pay_select" ON customer_payments
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "org_cust_pay_insert" ON customer_payments
  FOR INSERT WITH CHECK (org_id = auth_org_id());

CREATE POLICY "org_cust_pay_update" ON customer_payments
  FOR UPDATE USING (org_id = auth_org_id());

CREATE POLICY "admins_delete_cust_pay" ON customer_payments
  FOR DELETE USING (
    org_id = auth_org_id() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()::text AND role IN ('SUPER_ADMIN', 'ADMIN'))
  );

CREATE POLICY "org_supp_pay_select" ON supplier_payments
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "org_supp_pay_insert" ON supplier_payments
  FOR INSERT WITH CHECK (org_id = auth_org_id());

CREATE POLICY "org_supp_pay_update" ON supplier_payments
  FOR UPDATE USING (org_id = auth_org_id());

CREATE POLICY "admins_delete_supp_pay" ON supplier_payments
  FOR DELETE USING (
    org_id = auth_org_id() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()::text AND role IN ('SUPER_ADMIN', 'ADMIN'))
  );

-- ─── Tasks ────────────────────────────────────────────────────

CREATE POLICY "org_tasks_all" ON tasks
  FOR ALL USING (org_id = auth_org_id());

-- ─── Activity Logs — read only for all, write via service role ─

CREATE POLICY "org_activity_select" ON activity_logs
  FOR SELECT USING (org_id = auth_org_id());

-- Activity logs are written by backend service (SECURITY DEFINER functions)
-- so we do NOT allow anon/user INSERT on this table directly.
-- Workaround: use supabase service_role key in backend only.

-- ─── Trip Timeline — read only ────────────────────────────────

CREATE POLICY "org_timeline_select" ON trip_timeline
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM trips WHERE id = trip_timeline.trip_id AND org_id = auth_org_id())
  );

-- ─── Documents ────────────────────────────────────────────────

CREATE POLICY "org_docs_select" ON documents
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "org_docs_insert" ON documents
  FOR INSERT WITH CHECK (org_id = auth_org_id());

CREATE POLICY "org_docs_delete" ON documents
  FOR DELETE USING (
    org_id = auth_org_id() AND (
      uploaded_by_id = auth.uid()::text OR
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()::text AND role IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER'))
    )
  );

-- ─── Storage: document bucket policy ─────────────────────────
-- Run these in Supabase Dashboard > Storage > Policies

-- INSERT: authenticated users from the same org
-- SELECT: authenticated users from the same org
-- DELETE: owner or admin

-- These are configured in Supabase Dashboard UI, not SQL.
-- Bucket name: crm-documents
-- Policy: Authenticated users can upload/read their org's documents.
