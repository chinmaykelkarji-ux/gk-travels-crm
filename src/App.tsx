// ============================================================
// GK TRAVELS CRM — Application Root
// Provider order: QueryClientProvider → AuthProvider → BrowserRouter → Routes
// ============================================================

import { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { AuthProvider, useAuth }          from '@/backend/auth/AuthContext';
import { ProtectedRoute }                from '@/backend/auth/ProtectedRoute';
import { shouldRetry, STALE_TIME }        from '@/backend/api/apiError';

import { Sidebar }           from '@/shared/components/Sidebar';
import { Header }            from '@/shared/components/Header';
import { Toaster }           from '@/shared/components/Toaster';
import { ConfirmDialog }     from '@/shared/components/ConfirmDialog';
import { DashboardSkeleton } from '@/shared/components/LoadingSkeleton';

import { useStore }          from '@/store';
import type { TripFormSchema } from '@/shared/schemas/trip';
import { toast }             from '@/shared/hooks/useToast';
import { TripForm }          from '@/modules/trips/TripForm';

// ─── Lazy module imports ─────────────────────────────────────

const Dashboard  = lazy(() => import('@/modules/dashboard/Dashboard'));
const Trips      = lazy(() => import('@/modules/trips/Trips'));
const TripDetail = lazy(() => import('@/modules/trips/TripDetail'));
const Leads      = lazy(() => import('@/modules/leads/Leads'));
const Bookings   = lazy(() => import('@/modules/bookings/Bookings'));
const Customers  = lazy(() => import('@/modules/customers/Customers'));
const Finance    = lazy(() => import('@/modules/finance/Finance'));
const Operations    = lazy(() => import('@/modules/operations/Operations'));
const Vendors          = lazy(() => import('@/modules/vendors/Vendors'));
const VendorDetail     = lazy(() => import('@/modules/vendors/VendorDetail'));
const Quotations         = lazy(() => import('@/modules/quotations/Quotations'));
const QuotationDetail    = lazy(() => import('@/modules/quotations/QuotationDetail'));
const QuotationBuilder   = lazy(() => import('@/modules/quotations/QuotationBuilder'));
const Itineraries        = lazy(() => import('@/modules/itineraries/Itineraries'));
const ItineraryBuilder   = lazy(() => import('@/modules/itineraries/ItineraryBuilder'));
const ItineraryDetail    = lazy(() => import('@/modules/itineraries/ItineraryDetail'));
const Analytics          = lazy(() => import('@/modules/analytics/Analytics'));
const Vouchers           = lazy(() => import('@/modules/vouchers/Vouchers'));
const VoucherFormPage    = lazy(() => import('@/modules/vouchers/VoucherForm'));
const VoucherDetail      = lazy(() => import('@/modules/vouchers/VoucherDetail'));
const Settings           = lazy(() => import('@/modules/settings/Settings'));

console.log('[GK CRM] App.tsx module loaded');

// ─── QueryClient — global config ─────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME.short,
      retry:     shouldRetry,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// ─── Shared page-level loading spinner ───────────────────────
// Used as Suspense fallback for lazy pages so there is always
// visible feedback instead of a white screen.

function PageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── App Shell (rendered when authenticated) ─────────────────
// Uses <Outlet /> — child routes are defined in App below.

function AppShell() {
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [tripFormOpen, setTripFormOpen] = useState(false);
  const [creating,     setCreating]     = useState(false);

  const createTrip  = useStore(s => s.createTrip);
  const fetchAll    = useStore(s => s.fetchAll);
  const retryFetch  = useStore(s => s.retryFetch);
  const dataLoading = useStore(s => s.dataLoading);
  const dataError   = useStore(s => s.dataError);
  const { isLoading: authLoading } = useAuth();

  // Wait for auth bootstrap to finish, then load data
  useEffect(() => {
    if (!authLoading) void fetchAll();
  }, [authLoading, fetchAll]);

  async function handleCreateTrip(data: TripFormSchema) {
    setCreating(true);
    try {
      const trip = createTrip({
        customer:    data.customer,
        phone:       data.phone,
        destination: data.destination,
        pax:         data.pax,
        departure:   data.departure  || null,
        returnDate:  data.returnDate || null,
        type:        data.type,
        totalAmount: data.totalAmount ?? null,
        gstRate:     data.gstRate    ?? 5,
        notes:       data.notes      ?? '',
        status:      'draft',
      });
      toast.success('Trip created', `${trip.id} — ${data.destination}`);
      setTripFormOpen(false);
    } catch {
      toast.error('Failed to create trip');
    } finally {
      setCreating(false);
    }
  }

  // Block ONLY during auth bootstrap (getting JWT) — usually < 1 second.
  // Never block on dataLoading: render content immediately so the app
  // feels responsive; the store starts empty and fills in as data arrives.
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-[3px] border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Connecting…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#EEF2F7' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header
          onMenuToggle={() => setSidebarOpen(o => !o)}
          onNewTrip={() => setTripFormOpen(true)}
        />

        {/* Thin progress bar while data is loading — non-blocking */}
        {dataLoading && (
          <div className="h-0.5 w-full bg-gray-100 flex-shrink-0 overflow-hidden">
            <div
              className="h-full bg-indigo-500 animate-pulse"
              style={{ width: '60%', transition: 'width 0.5s ease' }}
            />
          </div>
        )}

        {/* Database error banner — shown above content, non-blocking */}
        {dataError && !dataLoading && (
          <div className="flex items-center justify-between gap-4 px-5 py-3 bg-red-50 border-b border-red-200 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-red-500 text-base flex-shrink-0">⚠</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-red-800">
                  Could not load data — make sure the backend server and database are running
                </p>
                <p className="text-xs text-red-500 mt-0.5 truncate">{dataError}</p>
              </div>
            </div>
            <button
              onClick={() => void retryFetch()}
              className="flex-shrink-0 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={<DashboardSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Global new-trip modal */}
      <TripForm
        open={tripFormOpen}
        onClose={() => setTripFormOpen(false)}
        onSubmit={handleCreateTrip}
        loading={creating}
      />

      <Toaster />
      <ConfirmDialog />
    </div>
  );
}

// ─── Root export ─────────────────────────────────────────────

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>

            {/* ── CRM shell — direct access, no login required ── */}
            <Route element={<AppShell />}>
                <Route index              element={<Dashboard />} />
                <Route path="/leads"      element={<Leads />} />
                <Route path="/trips"      element={<Trips />} />
                <Route path="/trips/:id"  element={<TripDetail />} />
                <Route path="/bookings"   element={<Bookings />} />
                <Route path="/customers"  element={<Customers />} />
                <Route path="/operations"   element={<Operations />} />
                <Route path="/vendors"         element={<Vendors />} />
                <Route path="/vendors/:id"     element={<VendorDetail />} />
                <Route path="/quotations"      element={<Quotations />} />
                <Route path="/quotations/new"  element={<QuotationBuilder />} />
                <Route path="/quotations/:id"  element={<QuotationDetail />} />
                <Route path="/quotations/:id/edit"    element={<QuotationBuilder />} />
                <Route path="/itineraries"             element={<Itineraries />} />
                <Route path="/itineraries/new"         element={<ItineraryBuilder />} />
                <Route path="/itineraries/:id"         element={<ItineraryDetail />} />
                <Route path="/itineraries/:id/edit"    element={<ItineraryBuilder />} />
                <Route path="/analytics"         element={<Analytics />} />
                <Route path="/vouchers"          element={<Vouchers />} />
                <Route path="/vouchers/new"      element={<VoucherFormPage />} />
                <Route path="/vouchers/:id"      element={<VoucherDetail />} />
                <Route path="/vouchers/:id/edit" element={<VoucherFormPage />} />
                <Route path="/settings"   element={<Settings />} />

                {/* Finance — MANAGER+ permission required */}
                <Route element={<ProtectedRoute permission="finance:view" />}>
                  <Route path="/finance"  element={<Finance />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>

          </Routes>
        </BrowserRouter>

        {import.meta.env.DEV && (
          <ReactQueryDevtools initialIsOpen={false} position="bottom" />
        )}
      </AuthProvider>
    </QueryClientProvider>
  );
}
