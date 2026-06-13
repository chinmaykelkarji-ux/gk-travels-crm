// ============================================================
// GK TRAVELS CRM — Application Root
// ============================================================

import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { AuthProvider, useAuth }        from '@/backend/auth/AuthContext';
import { ProtectedRoute, PublicRoute }  from '@/backend/auth/ProtectedRoute';
import { shouldRetry, STALE_TIME }      from '@/backend/api/apiError';

import { Sidebar }           from '@/shared/components/Sidebar';
import { Header }            from '@/shared/components/Header';
import { GlobalSearch }      from '@/modules/search/GlobalSearch';
import { Toaster }           from '@/shared/components/Toaster';
import { ConfirmDialog }     from '@/shared/components/ConfirmDialog';
import { DashboardSkeleton } from '@/shared/components/LoadingSkeleton';
import { RoleGuard }         from '@/shared/components/RoleGuard';

import { useStore }            from '@/store';
import type { TripFormSchema } from '@/shared/schemas/trip';
import { toast }               from '@/shared/hooks/useToast';
import { TripForm }            from '@/modules/trips/TripForm';

// ─── Lazy page imports ────────────────────────────────────────

const LoginPage      = lazy(() => import('@/modules/auth/LoginPage'));

const Dashboard      = lazy(() => import('@/modules/dashboard/Dashboard'));
const Trips          = lazy(() => import('@/modules/trips/Trips'));
const TripDetail     = lazy(() => import('@/modules/trips/TripDetail'));
const Bookings       = lazy(() => import('@/modules/bookings/Bookings'));
const BookingDetail  = lazy(() => import('@/modules/bookings/BookingDetail'));
const Customers      = lazy(() => import('@/modules/customers/Customers'));
const Operations     = lazy(() => import('@/modules/operations/Operations'));
const Vendors        = lazy(() => import('@/modules/vendors/Vendors'));
const VendorDetail   = lazy(() => import('@/modules/vendors/VendorDetail'));
const Quotations        = lazy(() => import('@/modules/quotations/Quotations'));
const QuotationDetail   = lazy(() => import('@/modules/quotations/QuotationDetail'));
const QuotationBuilder  = lazy(() => import('@/modules/quotations/QuotationBuilder'));
const EnquiryPipeline   = lazy(() => import('@/modules/sales/EnquiryPipeline'));
const SalesQuoteList    = lazy(() => import('@/modules/sales/SalesQuoteList'));
const SalesQuoteBuilder = lazy(() => import('@/modules/sales/SalesQuoteBuilder'));
const Itineraries       = lazy(() => import('@/modules/itineraries/Itineraries'));
const ItineraryBuilder  = lazy(() => import('@/modules/itineraries/ItineraryBuilder'));
const ItineraryDetail   = lazy(() => import('@/modules/itineraries/ItineraryDetail'));
const Analytics         = lazy(() => import('@/modules/analytics/Analytics'));
const Receivables       = lazy(() => import('@/modules/receivables/Receivables'));
const Vouchers          = lazy(() => import('@/modules/vouchers/Vouchers'));
const VoucherFormPage   = lazy(() => import('@/modules/vouchers/VoucherForm'));
const VoucherDetail     = lazy(() => import('@/modules/vouchers/VoucherDetail'));
const DailyOps          = lazy(() => import('@/modules/ops/DailyOps'));
const Settings          = lazy(() => import('@/modules/settings/Settings'));
const Invoices          = lazy(() => import('@/modules/invoices/Invoices'));
const InvoiceBuilder    = lazy(() => import('@/modules/invoices/InvoiceBuilder'));
const InvoiceDetail     = lazy(() => import('@/modules/invoices/InvoiceDetail'));
const CreditNotes       = lazy(() => import('@/modules/invoices/CreditNotes'));
const DebitNotes        = lazy(() => import('@/modules/invoices/DebitNotes'));
const CreditDebitNoteForm   = lazy(() => import('@/modules/invoices/CreditDebitNoteForm'));
const CreditDebitNoteDetail = lazy(() => import('@/modules/invoices/CreditDebitNoteDetail'));
const GstReports        = lazy(() => import('@/modules/invoices/GstReports'));
const OperationsDashboard = lazy(() => import('@/modules/operations/OperationsDashboard'));
const AiItineraryBuilder   = lazy(() => import('@/modules/trips/AiItineraryBuilder'));
const TripTimeline         = lazy(() => import('@/modules/operations/TripTimeline'));
const UserManagement       = lazy(() => import('@/modules/users/UserManagement'));

// ─── QueryClient ─────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME.short,
      retry:     shouldRetry,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

// ─── Page-level Suspense fallback ─────────────────────────────

function PageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── AppShell ─────────────────────────────────────────────────
// Rendered only after ProtectedRoute confirms the user is authenticated.

function AppShell() {
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [tripFormOpen, setTripFormOpen] = useState(false);
  const [searchOpen,   setSearchOpen]   = useState(false);
  const [creating,     setCreating]     = useState(false);

  const openSearch  = useCallback(() => setSearchOpen(true),  []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // Ctrl+K / Cmd+K global shortcut
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(s => !s);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const createTrip  = useStore(s => s.createTrip);
  const fetchAll    = useStore(s => s.fetchAll);
  const retryFetch  = useStore(s => s.retryFetch);
  const dataLoading = useStore(s => s.dataLoading);
  const dataError   = useStore(s => s.dataError);

  // Auth is already confirmed by ProtectedRoute — fetch CRM data immediately.
  useEffect(() => {
    void fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#EEF2F7' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header
          onMenuToggle={() => setSidebarOpen(o => !o)}
          onNewTrip={() => setTripFormOpen(true)}
          onSearchOpen={openSearch}
        />

        {/* Non-blocking 2 px progress bar while Zustand store hydrates */}
        {dataLoading && (
          <div className="h-0.5 w-full bg-gray-100 flex-shrink-0 overflow-hidden">
            <div
              className="h-full bg-indigo-500 animate-pulse"
              style={{ width: '65%' }}
            />
          </div>
        )}

        {/* Error banner if DB is unreachable */}
        {dataError && !dataLoading && (
          <div className="flex items-center justify-between gap-4 px-5 py-3 bg-red-50 border-b border-red-200 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-red-500 flex-shrink-0">⚠</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-red-800">
                  Could not load data — ensure the backend and database are running
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

      <TripForm
        open={tripFormOpen}
        onClose={() => setTripFormOpen(false)}
        onSubmit={handleCreateTrip}
        loading={creating}
      />

      <GlobalSearch open={searchOpen} onClose={closeSearch} />
      <Toaster />
      <ConfirmDialog />
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>

            {/* ── Public routes (unauthenticated only) ─────────── */}
            <Route element={<PublicRoute redirectTo="/" />}>
              <Route
                path="/login"
                element={
                  <Suspense fallback={<PageSpinner />}>
                    <LoginPage />
                  </Suspense>
                }
              />
            </Route>

            {/* ── Protected routes (authenticated only) ────────── */}
            <Route element={<ProtectedRoute redirectTo="/login" />}>
              <Route element={<AppShell />}>
                <Route index                         element={<Dashboard />} />
                <Route path="/trips"                 element={<Trips />} />
                <Route path="/trips/:id"             element={<TripDetail />} />
                <Route path="/trips/:tripId/itinerary" element={<RoleGuard allowed={['ADMIN', 'BOOKING']}><AiItineraryBuilder /></RoleGuard>} />
                <Route path="/bookings"              element={<Bookings />} />
                <Route path="/bookings/:id"          element={<BookingDetail />} />
                <Route path="/customers"             element={<Customers />} />
                <Route path="/operations"            element={<Operations />} />
                <Route path="/operations-dashboard"  element={<RoleGuard allowed={['ADMIN', 'BOOKING', 'OPERATIONS']}><OperationsDashboard /></RoleGuard>} />
                <Route path="/trips/:id/timeline"    element={<TripTimeline />} />
                <Route path="/vendors"               element={<Vendors />} />
                <Route path="/vendors/:id"           element={<VendorDetail />} />
                <Route path="/quotations"            element={<Quotations />} />
                <Route path="/quotations/new"        element={<QuotationBuilder />} />
                <Route path="/quotations/:id"        element={<QuotationDetail />} />
                <Route path="/quotations/:id/edit"   element={<QuotationBuilder />} />
                <Route path="/enquiries"             element={<RoleGuard allowed={['ADMIN', 'BOOKING']}><EnquiryPipeline /></RoleGuard>} />
                <Route path="/sales-quotes"          element={<RoleGuard allowed={['ADMIN', 'BOOKING']}><SalesQuoteList /></RoleGuard>} />
                <Route path="/sales-quotes/new"      element={<RoleGuard allowed={['ADMIN', 'BOOKING']}><SalesQuoteBuilder /></RoleGuard>} />
                <Route path="/sales-quotes/:id"      element={<RoleGuard allowed={['ADMIN', 'BOOKING']}><SalesQuoteBuilder /></RoleGuard>} />
                <Route path="/itineraries"           element={<Itineraries />} />
                <Route path="/itineraries/new"       element={<ItineraryBuilder />} />
                <Route path="/itineraries/:id"       element={<ItineraryDetail />} />
                <Route path="/itineraries/:id/edit"  element={<ItineraryBuilder />} />
                <Route path="/analytics"             element={<Analytics />} />
                <Route path="/vouchers"              element={<Vouchers />} />
                <Route path="/vouchers/new"          element={<VoucherFormPage />} />
                <Route path="/vouchers/:id"          element={<VoucherDetail />} />
                <Route path="/vouchers/:id/edit"     element={<VoucherFormPage />} />
                <Route path="/invoices"              element={<RoleGuard allowed={['ADMIN', 'ACCOUNTS']}><Invoices /></RoleGuard>} />
                <Route path="/invoices/new"          element={<RoleGuard allowed={['ADMIN', 'ACCOUNTS']}><InvoiceBuilder /></RoleGuard>} />
                <Route path="/invoices/:id"          element={<RoleGuard allowed={['ADMIN', 'ACCOUNTS']}><InvoiceDetail /></RoleGuard>} />
                <Route path="/invoices/:id/edit"     element={<RoleGuard allowed={['ADMIN', 'ACCOUNTS']}><InvoiceBuilder /></RoleGuard>} />
                <Route path="/credit-notes"          element={<CreditNotes />} />
                <Route path="/credit-notes/new"      element={<CreditDebitNoteForm kind="credit" />} />
                <Route path="/credit-notes/:id"      element={<CreditDebitNoteDetail kind="credit" />} />
                <Route path="/credit-notes/:id/edit" element={<CreditDebitNoteForm kind="credit" />} />
                <Route path="/debit-notes"           element={<DebitNotes />} />
                <Route path="/debit-notes/new"       element={<CreditDebitNoteForm kind="debit" />} />
                <Route path="/debit-notes/:id"       element={<CreditDebitNoteDetail kind="debit" />} />
                <Route path="/debit-notes/:id/edit"  element={<CreditDebitNoteForm kind="debit" />} />
                <Route path="/gst-reports"           element={<RoleGuard allowed={['ADMIN', 'ACCOUNTS']}><GstReports /></RoleGuard>} />
                <Route path="/receivables"           element={<RoleGuard allowed={['ADMIN', 'ACCOUNTS']}><Receivables /></RoleGuard>} />
                <Route path="/daily-ops"             element={<DailyOps />} />
                <Route path="/settings"              element={<Settings />} />
                <Route path="/users"                 element={<RoleGuard allowed={['ADMIN']}><UserManagement /></RoleGuard>} />
                <Route path="*"                      element={<Navigate to="/" replace />} />
              </Route>
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
