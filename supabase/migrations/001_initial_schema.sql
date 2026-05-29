-- ============================================================
-- GK TRAVELS CRM — Initial Schema Migration
-- Run this in Supabase SQL editor or via: prisma migrate deploy
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for trigram similarity search

-- ─── Enums ────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF');
CREATE TYPE trip_status AS ENUM ('DRAFT', 'QUOTATION', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE lead_status AS ENUM ('NEW', 'CONTACTED', 'FOLLOW_UP', 'QUOTATION_SENT', 'CONFIRMED', 'CONVERTED', 'CANCELLED');
CREATE TYPE lead_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE booking_type AS ENUM ('FLIGHT', 'HOTEL', 'TRAIN', 'BUS', 'CAB', 'VISA', 'INSURANCE', 'ACTIVITY', 'OTHER');
CREATE TYPE booking_status AS ENUM ('PENDING', 'CONFIRMED', 'ISSUED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CHECKED_IN', 'DEPARTED', 'COMPLETED', 'CANCELLED');
CREATE TYPE payment_status AS ENUM ('PENDING', 'RECEIVED', 'PAID', 'FAILED', 'REFUNDED');
CREATE TYPE task_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE task_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE document_category AS ENUM ('PASSPORT', 'VISA', 'INSURANCE', 'FLIGHT_TICKET', 'HOTEL_VOUCHER', 'PAN_CARD', 'AADHAAR', 'OTHER');

-- ─── Organisations ────────────────────────────────────────────

CREATE TABLE organisations (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT        NOT NULL,
  gstin       TEXT        UNIQUE,
  address     TEXT,
  city        TEXT,
  state       TEXT,
  pincode     TEXT,
  phone       TEXT,
  email       TEXT,
  website     TEXT,
  logo_url    TEXT,
  currency    TEXT        NOT NULL DEFAULT 'INR',
  timezone    TEXT        NOT NULL DEFAULT 'Asia/Kolkata',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Profiles (extends Supabase auth.users) ───────────────────

CREATE TABLE profiles (
  id            TEXT        PRIMARY KEY,  -- matches auth.users.id
  org_id        TEXT        NOT NULL REFERENCES organisations(id),
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'STAFF',
  avatar        TEXT,
  phone         TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_org ON profiles(org_id);
CREATE INDEX idx_profiles_email ON profiles(email);

-- Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Customers ────────────────────────────────────────────────

CREATE TABLE customers (
  id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id            TEXT        NOT NULL REFERENCES organisations(id),
  name              TEXT        NOT NULL,
  phone             TEXT        NOT NULL,
  alt_phone         TEXT,
  email             TEXT,
  address           TEXT,
  city              TEXT,
  passport_no       TEXT,
  passport_expiry   DATE,
  passport_country  TEXT,
  pan_number        TEXT,
  aadhaar_number    TEXT,
  preferences       JSONB       NOT NULL DEFAULT '{}',
  notes             TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_org     ON customers(org_id);
CREATE INDEX idx_customers_phone   ON customers(org_id, phone);
CREATE INDEX idx_customers_name    ON customers USING gin(name gin_trgm_ops);

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Leads ────────────────────────────────────────────────────

CREATE TABLE leads (
  id                TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id            TEXT          NOT NULL REFERENCES organisations(id),
  customer_id       TEXT          REFERENCES customers(id),
  display_id        TEXT          NOT NULL,
  name              TEXT          NOT NULL,
  phone             TEXT          NOT NULL,
  email             TEXT,
  source            TEXT          NOT NULL,
  destination       TEXT,
  travel_date       DATE,
  return_date       DATE,
  pax               INTEGER       NOT NULL DEFAULT 1,
  budget            NUMERIC(14,2),
  trip_type         TEXT,
  status            lead_status   NOT NULL DEFAULT 'NEW',
  priority          lead_priority NOT NULL DEFAULT 'MEDIUM',
  notes             TEXT,
  follow_up_date    DATE,
  assigned_to_id    TEXT          REFERENCES profiles(id),
  created_by_id     TEXT          REFERENCES profiles(id),
  converted_trip_id TEXT          UNIQUE,
  converted_at      TIMESTAMPTZ,
  converted_by_id   TEXT          REFERENCES profiles(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_org        ON leads(org_id);
CREATE INDEX idx_leads_status     ON leads(org_id, status);
CREATE INDEX idx_leads_assigned   ON leads(assigned_to_id);
CREATE UNIQUE INDEX idx_leads_display ON leads(org_id, display_id);

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Trips ────────────────────────────────────────────────────

CREATE TABLE trips (
  id               TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id           TEXT          NOT NULL REFERENCES organisations(id),
  customer_id      TEXT          REFERENCES customers(id),
  display_id       TEXT          NOT NULL,
  customer         TEXT          NOT NULL,
  phone            TEXT          NOT NULL,
  email            TEXT,
  destination      TEXT          NOT NULL,
  type             TEXT          NOT NULL,
  pax              INTEGER       NOT NULL,
  departure        DATE,
  return_date      DATE,
  status           trip_status   NOT NULL DEFAULT 'DRAFT',

  -- Financial
  total_amount     NUMERIC(14,2),
  gst_rate         NUMERIC(5,2)  NOT NULL DEFAULT 5,
  discount         NUMERIC(14,2),

  -- Computed financial cache
  gst_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_payable    NUMERIC(14,2),
  paid_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due      NUMERIC(14,2) NOT NULL DEFAULT 0,
  supplier_cost    NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_margin     NUMERIC(14,2) NOT NULL DEFAULT 0,
  margin_pct       NUMERIC(7,3)  NOT NULL DEFAULT 0,

  -- Operational flags
  visa_status      TEXT          NOT NULL DEFAULT 'pending',
  hotel_status     TEXT          NOT NULL DEFAULT 'pending',
  flight_status    TEXT          NOT NULL DEFAULT 'pending',
  check_in_status  TEXT          NOT NULL DEFAULT 'not_due',

  notes            TEXT,
  assigned_to_id   TEXT          REFERENCES profiles(id),
  created_by_id    TEXT          REFERENCES profiles(id),

  -- Lead conversion
  source_lead_id   TEXT,
  converted_at     TIMESTAMPTZ,
  converted_by_id  TEXT          REFERENCES profiles(id),

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_trips_org        ON trips(org_id);
CREATE INDEX idx_trips_status     ON trips(org_id, status);
CREATE INDEX idx_trips_customer   ON trips(customer_id);
CREATE INDEX idx_trips_departure  ON trips(departure);
CREATE UNIQUE INDEX idx_trips_display ON trips(org_id, display_id);

CREATE TRIGGER trips_updated_at BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Bookings ─────────────────────────────────────────────────

CREATE TABLE bookings (
  id               TEXT           PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id           TEXT           NOT NULL REFERENCES organisations(id),
  trip_id          TEXT           REFERENCES trips(id) ON DELETE SET NULL,
  customer_id      TEXT           REFERENCES customers(id),
  display_id       TEXT           NOT NULL,
  type             booking_type   NOT NULL,
  booking_status   booking_status NOT NULL DEFAULT 'PENDING',
  customer_name    TEXT           NOT NULL,

  -- Financial
  selling_price    NUMERIC(14,2),
  supplier_cost    NUMERIC(14,2)  NOT NULL DEFAULT 0,
  advance          NUMERIC(14,2)  NOT NULL DEFAULT 0,
  supplier_paid    NUMERIC(14,2)  NOT NULL DEFAULT 0,
  gst_rate         NUMERIC(5,2)   NOT NULL DEFAULT 0,

  -- Computed
  gst_amount       NUMERIC(14,2)  NOT NULL DEFAULT 0,
  total_payable    NUMERIC(14,2),
  balance_due      NUMERIC(14,2)  NOT NULL DEFAULT 0,
  supplier_pending NUMERIC(14,2)  NOT NULL DEFAULT 0,
  gross_margin     NUMERIC(14,2)  NOT NULL DEFAULT 0,
  margin_pct       NUMERIC(7,3)   NOT NULL DEFAULT 0,

  detail           JSONB          NOT NULL DEFAULT '{}',
  notes            TEXT,

  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_org     ON bookings(org_id);
CREATE INDEX idx_bookings_trip    ON bookings(trip_id);
CREATE UNIQUE INDEX idx_bookings_display ON bookings(org_id, display_id);

CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Customer Payments ────────────────────────────────────────

CREATE TABLE customer_payments (
  id           TEXT           PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id       TEXT           NOT NULL REFERENCES organisations(id),
  trip_id      TEXT           REFERENCES trips(id) ON DELETE SET NULL,
  booking_id   TEXT           REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id  TEXT           REFERENCES customers(id),
  display_id   TEXT           NOT NULL,
  customer     TEXT,
  amount       NUMERIC(14,2)  NOT NULL,
  method       TEXT           NOT NULL,
  date         DATE           NOT NULL DEFAULT CURRENT_DATE,
  paid_date    DATE,
  status       payment_status NOT NULL DEFAULT 'RECEIVED',
  reference    TEXT,
  notes        TEXT,
  created_by_id TEXT          REFERENCES profiles(id),
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_cust_pay_org  ON customer_payments(org_id);
CREATE INDEX idx_cust_pay_trip ON customer_payments(trip_id);
CREATE INDEX idx_cust_pay_date ON customer_payments(org_id, date);

CREATE TRIGGER cust_pay_updated_at BEFORE UPDATE ON customer_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Supplier Payments ────────────────────────────────────────

CREATE TABLE supplier_payments (
  id           TEXT           PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id       TEXT           NOT NULL REFERENCES organisations(id),
  trip_id      TEXT           REFERENCES trips(id) ON DELETE SET NULL,
  booking_id   TEXT           REFERENCES bookings(id) ON DELETE SET NULL,
  display_id   TEXT           NOT NULL,
  supplier     TEXT,
  amount       NUMERIC(14,2)  NOT NULL,
  method       TEXT           NOT NULL,
  date         DATE           NOT NULL DEFAULT CURRENT_DATE,
  paid_date    DATE,
  status       payment_status NOT NULL DEFAULT 'PENDING',
  reference    TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_supp_pay_org  ON supplier_payments(org_id);
CREATE INDEX idx_supp_pay_trip ON supplier_payments(trip_id);

CREATE TRIGGER supp_pay_updated_at BEFORE UPDATE ON supplier_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Tasks ────────────────────────────────────────────────────

CREATE TABLE tasks (
  id            TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id        TEXT          NOT NULL REFERENCES organisations(id),
  trip_id       TEXT          REFERENCES trips(id) ON DELETE SET NULL,
  booking_id    TEXT          REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id   TEXT          REFERENCES customers(id),
  title         TEXT          NOT NULL,
  description   TEXT,
  priority      task_priority NOT NULL DEFAULT 'MEDIUM',
  status        task_status   NOT NULL DEFAULT 'PENDING',
  due_date      DATE,
  assigned_to_id TEXT         REFERENCES profiles(id),
  completed_at  TIMESTAMPTZ,
  created_by_id TEXT          REFERENCES profiles(id),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_org    ON tasks(org_id);
CREATE INDEX idx_tasks_status ON tasks(org_id, status);
CREATE INDEX idx_tasks_trip   ON tasks(trip_id);

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Activity Logs (immutable) ────────────────────────────────

CREATE TABLE activity_logs (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id       TEXT        NOT NULL REFERENCES organisations(id),
  type         TEXT        NOT NULL,
  message      TEXT        NOT NULL,
  entity_type  TEXT        NOT NULL,
  entity_id    TEXT        NOT NULL,
  user_id      TEXT        REFERENCES profiles(id),
  before       JSONB,
  after        JSONB,
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No updated_at — audit logs are immutable
);

CREATE INDEX idx_activity_org    ON activity_logs(org_id);
CREATE INDEX idx_activity_entity ON activity_logs(org_id, entity_type, entity_id);
CREATE INDEX idx_activity_user   ON activity_logs(user_id);
CREATE INDEX idx_activity_time   ON activity_logs(created_at);

-- ─── Trip Timeline (immutable events) ────────────────────────

CREATE TABLE trip_timeline (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  trip_id    TEXT        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  event      TEXT        NOT NULL,
  type       TEXT        NOT NULL DEFAULT 'info',
  user_id    TEXT        REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_timeline_trip ON trip_timeline(trip_id);

-- ─── Documents ────────────────────────────────────────────────

CREATE TABLE documents (
  id             TEXT              PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id         TEXT              NOT NULL REFERENCES organisations(id),
  trip_id        TEXT              REFERENCES trips(id) ON DELETE SET NULL,
  booking_id     TEXT              REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id    TEXT              REFERENCES customers(id),
  name           TEXT              NOT NULL,
  category       document_category NOT NULL,
  storage_url    TEXT              NOT NULL,
  storage_path   TEXT              NOT NULL,
  mime_type      TEXT              NOT NULL,
  size           INTEGER           NOT NULL,
  uploaded_by_id TEXT              REFERENCES profiles(id),
  created_at     TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX idx_docs_trip     ON documents(trip_id);
CREATE INDEX idx_docs_customer ON documents(customer_id);

-- ─── Trigger: auto-create profile on auth.users insert ───────
-- This fires when a new user signs up via Supabase Auth.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Profile is created via the app onboarding flow, not automatically.
  -- This function is a placeholder for custom signup logic.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Function: get_org_stats ──────────────────────────────────

CREATE OR REPLACE FUNCTION get_org_stats(p_org_id TEXT)
RETURNS TABLE(
  trip_count      BIGINT,
  lead_count      BIGINT,
  customer_count  BIGINT,
  total_revenue   NUMERIC,
  total_collected NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM trips         WHERE org_id = p_org_id AND status != 'CANCELLED'),
    (SELECT COUNT(*) FROM leads         WHERE org_id = p_org_id AND status NOT IN ('CONVERTED','CANCELLED')),
    (SELECT COUNT(*) FROM customers     WHERE org_id = p_org_id AND is_active = true),
    (SELECT COALESCE(SUM(total_payable),0) FROM trips WHERE org_id = p_org_id AND total_payable IS NOT NULL),
    (SELECT COALESCE(SUM(amount),0) FROM customer_payments WHERE org_id = p_org_id AND status = 'RECEIVED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
