import { useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from '@/shared/components/Sidebar';
import { Header } from '@/shared/components/Header';
import { Toaster } from '@/shared/components/Toaster';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { DashboardSkeleton } from '@/shared/components/LoadingSkeleton';
import { useStore } from '@/store';
import type { TripFormSchema } from '@/shared/schemas/trip';
import { toast } from '@/shared/hooks/useToast';
import { TripForm } from '@/modules/trips/TripForm';

// Lazy-load all modules to keep initial bundle small
const Dashboard  = lazy(() => import('@/modules/dashboard/Dashboard'));
const Trips      = lazy(() => import('@/modules/trips/Trips'));
const TripDetail = lazy(() => import('@/modules/trips/TripDetail'));
const Leads      = lazy(() => import('@/modules/leads/Leads'));
const Bookings   = lazy(() => import('@/modules/bookings/Bookings'));
const Customers  = lazy(() => import('@/modules/customers/Customers'));
const Finance    = lazy(() => import('@/modules/finance/Finance'));
const Operations = lazy(() => import('@/modules/operations/Operations'));
const Settings   = lazy(() => import('@/modules/settings/Settings'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: false,
    },
  },
});

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tripFormOpen, setTripFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const createTrip = useStore(s => s.createTrip);

  async function handleCreateTrip(data: TripFormSchema) {
    setCreating(true);
    try {
      const trip = createTrip({
        customer:    data.customer,
        phone:       data.phone,
        destination: data.destination,
        pax:         data.pax,
        departure:   data.departure || null,
        returnDate:  data.returnDate || null,
        type:        data.type,
        totalAmount: data.totalAmount ?? null,
        gstRate:     data.gstRate ?? 5,
        notes:       data.notes ?? '',
        status:      'draft',
      });
      toast.success('Trip created', `${trip.id} — ${data.destination}`);
      setTripFormOpen(false);
    } catch (err) {
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
            <Routes>
              <Route path="/"           element={<Dashboard />} />
              <Route path="/leads"      element={<Leads />} />
              <Route path="/trips"      element={<Trips />} />
              <Route path="/trips/:id"  element={<TripDetail />} />
              <Route path="/bookings"   element={<Bookings />} />
              <Route path="/customers"  element={<Customers />} />
              <Route path="/finance"    element={<Finance />} />
              <Route path="/operations" element={<Operations />} />
              <Route path="/settings"   element={<Settings />} />
              <Route path="*"           element={<Dashboard />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      {/* Global trip creation form */}
      <TripForm
        open={tripFormOpen}
        onClose={() => setTripFormOpen(false)}
        onSubmit={handleCreateTrip}
        loading={creating}
      />

      {/* Global toast system */}
      <Toaster />

      {/* Global confirm dialog */}
      <ConfirmDialog />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
