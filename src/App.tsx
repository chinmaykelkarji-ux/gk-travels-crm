// ============================================================
// GK TRAVELS CRM — Application Root
//
// Route hierarchy:
//   /login, /signup, /forgot-password   → PublicRoute (no shell, redirects if authed)
//   /auth/reset-password                → standalone (no shell, handles recovery token)
//   / and all CRM paths                 → ProtectedRoute → AppShell → Outlet
//
// Provider order:
//   QueryClientProvider → AuthProvider → BrowserRouter → Routes
// ============================================================

import { useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { AuthProvider }                   from '@/backend/auth/AuthContext';
import { ProtectedRoute, PublicRoute }    from '@/backend/auth/ProtectedRoute';
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

const LoginPage          = lazy(() => import('@/modules/auth/LoginPage'));
const SignupPage         = lazy(() => import('@/modules/auth/SignupPage'));
const ForgotPasswordPage = lazy(() => import('@/modules/auth/ForgotPasswordPage'));
const ResetPasswordPage  = lazy(() => import('@/modules/auth/ResetPasswordPage'));

const Dashboard  = lazy(() => import('@/modules/dashboard/Dashboard'));
const Trips      = lazy(() => import('@/modules/trips/Trips'));
const TripDetail = lazy(() => import('@/modules/trips/TripDetail'));
const Leads      = lazy(() => import('@/modules/leads/Leads'));
const Bookings   = lazy(() => import('@/modules/bookings/Bookings'));
const Customers  = lazy(() => import('@/modules/customers/Customers'));
const Finance    = lazy(() => import('@/modules/finance/Finance'));
const Operations = lazy(() => import('@/modules/operations/Operations'));
const Settings   = lazy(() => import('@/modules/settings/Settings'));

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
  const createTrip = useStore(s => s.createTrip);

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
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header
          onMenuToggle={() => setSidebarOpen(o => !o)}
          onNewTrip={() => setTripFormOpen(true)}
        />

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

            {/* ── Auth pages — no shell, redirect to / if already signed in ── */}
            <Route element={<PublicRoute />}>
              <Route path="/login"           element={<Suspense fallback={<PageSpinner />}><LoginPage /></Suspense>} />
              <Route path="/signup"          element={<Suspense fallback={<PageSpinner />}><SignupPage /></Suspense>} />
              <Route path="/forgot-password" element={<Suspense fallback={<PageSpinner />}><ForgotPasswordPage /></Suspense>} />
            </Route>

            {/* ── Password reset — Supabase lands here with a recovery token ── */}
            <Route
              path="/auth/reset-password"
              element={<Suspense fallback={<PageSpinner />}><ResetPasswordPage /></Suspense>}
            />

            {/* ── Protected CRM shell — requires active Supabase session ────── */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route index              element={<Dashboard />} />
                <Route path="/leads"      element={<Leads />} />
                <Route path="/trips"      element={<Trips />} />
                <Route path="/trips/:id"  element={<TripDetail />} />
                <Route path="/bookings"   element={<Bookings />} />
                <Route path="/customers"  element={<Customers />} />
                <Route path="/operations" element={<Operations />} />
                <Route path="/settings"   element={<Settings />} />

                {/* Finance — MANAGER+ permission required */}
                <Route element={<ProtectedRoute permission="finance:view" />}>
                  <Route path="/finance"  element={<Finance />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
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
