// ============================================================
// GK TRAVELS CRM — Public Supabase entry point
//
// Import from here, never from the backend path directly.
// This barrel keeps the single shared client instance intact
// while providing a stable @/lib/supabase import path for:
//   - Auth (useSession, signIn, signOut, RBAC)
//   - PostgreSQL queries (via repositories)
//   - Real-time subscriptions
//   - Supabase Storage (documents, avatars)
// ============================================================

export {
  supabase,
  isSupabaseConfigured,
  query,
  queryNullable,
  mutate,
  STORAGE_BUCKETS,
} from '@/backend/supabase/client';

export type {
  // ── Core DB types ──────────────────────────────────────────
  Database,
  Json,
  // ── Enum types ─────────────────────────────────────────────
  UserRole,
  TripStatus,
  LeadStatus,
  LeadPriority,
  BookingType,
  BookingStatus,
  PaymentStatus,
  TaskPriority,
  TaskStatus,
  DocumentCategory,
  // ── Row aliases ─────────────────────────────────────────────
  DbOrganisation,
  DbProfile,
  DbCustomer,
  DbLead,
  DbTrip,
  DbBooking,
  DbCustomerPayment,
  DbSupplierPayment,
  DbTask,
  DbActivityLog,
  DbTripTimeline,
  DbDocument,
} from '@/backend/supabase/database.types';
