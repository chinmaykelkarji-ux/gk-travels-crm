import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInHours, parseISO, isValid, addDays, format } from 'date-fns';
import {
  Plane, Building2, Car, AlertCircle, AlertTriangle, Clock,
  RefreshCw, CheckCircle2, Sparkles,
} from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { useStore } from '@/store';
import { useDashboard } from '@/shared/hooks/useDashboard';
import { ServiceStatusBadge } from '@/shared/components/ServiceStatusBadge';
import { formatCurrency } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { toast } from '@/shared/hooks/useToast';
import { AiMessagePanel } from '@/shared/components/AiMessagePanel';
import type { TripServiceDTO } from '@/shared/types/operations';

// ── Helpers ───────────────────────────────────────────────────────

function hoursRemaining(serviceDate: string): number {
  const d = parseISO(serviceDate);
  return isValid(d) ? differenceInHours(d, new Date()) : 0;
}

function flightLabel(s: TripServiceDTO): string {
  return (s.details.flightNo as string) ?? 'Flight TBD';
}

function hotelLabel(s: TripServiceDTO): string {
  return (s.details.propertyName as string) ?? 'Hotel TBD';
}

function vehicleLabel(s: TripServiceDTO): string {
  return (s.details.vehicleType as string) ?? 'Vehicle TBD';
}

// ── Skeleton ──────────────────────────────────────────────────────

function SkeletonCard() {
  return <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />;
}

// ── Stat card ─────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  value: number;
  label: string;
  theme: 'blue' | 'green' | 'amber' | 'red' | 'neutral';
  onClick?: () => void;
}

const STAT_THEME: Record<StatCardProps['theme'], string> = {
  blue:    'bg-blue-50 text-blue-700 ring-blue-100',
  green:   'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber:   'bg-amber-50 text-amber-700 ring-amber-100',
  red:     'bg-red-50 text-red-700 ring-red-100',
  neutral: 'bg-gray-50 text-gray-600 ring-gray-100',
};

function StatCard({ icon: Icon, value, label, theme, onClick }: StatCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-2xl p-4 ring-1 text-left transition-transform hover:scale-[1.01]',
        STAT_THEME[theme],
      )}
    >
      <div className="w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="text-xs font-medium mt-1">{label}</div>
      </div>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export default function OperationsDashboard() {
  const { data, loading, error, refetch } = useDashboard();
  const navigate = useNavigate();
  const companySettings = useStore(s => s.companySettings);
  const risksRef = useRef<HTMLDivElement>(null);
  const confirmationsRef = useRef<HTMLDivElement>(null);
  const paymentsRef = useRef<HTMLDivElement>(null);

  const [confirming, setConfirming] = useState<Record<string, boolean>>({});
  const [reminderSent, setReminderSent] = useState<Record<string, boolean>>({});
  const [aiPanelPayment, setAiPanelPayment] = useState<NonNullable<typeof data>['pendingPayments'][number] | null>(null);

  async function markConfirmed(serviceId: string) {
    setConfirming(prev => ({ ...prev, [serviceId]: true }));
    try {
      await apiClient.put(`/trip-services/${serviceId}`, { status: 'CONFIRMED' });
      toast.success('Service confirmed');
      refetch();
    } catch {
      toast.error('Failed to update service');
    } finally {
      setConfirming(prev => ({ ...prev, [serviceId]: false }));
    }
  }

  async function sendPaymentReminder(payment: NonNullable<typeof data>['pendingPayments'][number]) {
    try {
      const dueDate = format(addDays(new Date(), payment.daysUntilDeparture), 'dd/MM/yyyy');
      await apiClient.post('/messaging/send-whatsapp', {
        tripId: payment.tripId,
        templateName: 'payment_reminder',
        phone: payment.customerPhone,
        data: {
          customerName: payment.customerName,
          tripName:     payment.tripName,
          amountDue:    payment.amountDue,
          dueDate,
          agencyPhone:  companySettings?.phone ?? '',
        },
      });
      setReminderSent(prev => ({ ...prev, [payment.tripId]: true }));
      toast.success('Reminder sent');
      setTimeout(() => setReminderSent(prev => ({ ...prev, [payment.tripId]: false })), 3000);
    } catch {
      toast.error('Failed to send reminder');
    }
  }

  if (loading && !data) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center gap-3 mt-20">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-gray-600">Failed to load dashboard. {error}</p>
        <button
          onClick={refetch}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const allEmpty =
    data.todayDepartures.length === 0 &&
    data.todayArrivals.length === 0 &&
    data.hotelCheckIns.length === 0 &&
    data.hotelCheckOuts.length === 0 &&
    data.vehicleSchedules.length === 0 &&
    data.pendingConfirmations.length === 0 &&
    data.pendingPayments.length === 0 &&
    data.upcomingRisks.length === 0;

  const flights = [...data.todayDepartures, ...data.todayArrivals];
  const hotels = [
    ...data.hotelCheckIns.map(s => ({ ...s, _kind: 'Check-in' as const })),
    ...data.hotelCheckOuts.map(s => ({ ...s, _kind: 'Check-out' as const })),
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Section A — Risk alert bar */}
      {data.upcomingRisks.length > 0 && (
        <button
          onClick={() => risksRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="w-full flex items-center gap-2 rounded-xl bg-red-50 ring-1 ring-red-200 text-red-700 px-4 py-3 text-sm font-semibold text-left hover:bg-red-100 transition-colors"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          ⚠ {data.upcomingRisks.length} trip{data.upcomingRisks.length > 1 ? 's' : ''} departing within 48 hours have unconfirmed services — scroll down to review
        </button>
      )}

      {allEmpty ? (
        <div className="flex flex-col items-center justify-center text-center gap-2 py-24">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          <p className="text-sm font-medium text-gray-600">All clear — no operations today 🎉</p>
        </div>
      ) : (
        <>
          {/* Section B — Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Plane} value={data.todayDepartures.length} label="Today's departures" theme="blue" />
            <StatCard icon={Building2} value={data.hotelCheckIns.length} label="Hotel check-ins today" theme="green" />
            <StatCard
              icon={Clock}
              value={data.pendingConfirmations.length}
              label="Pending confirmations"
              theme={data.pendingConfirmations.length > 0 ? 'red' : 'amber'}
              onClick={() => confirmationsRef.current?.scrollIntoView({ behavior: 'smooth' })}
            />
            <StatCard
              icon={AlertCircle}
              value={data.pendingPayments.length}
              label="Pending payments"
              theme={data.pendingPayments.length > 0 ? 'red' : 'neutral'}
              onClick={() => paymentsRef.current?.scrollIntoView({ behavior: 'smooth' })}
            />
          </div>

          {/* Section C — Today's operations */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Column 1 — Flights */}
            <div className="bg-white rounded-2xl ring-1 ring-gray-100 p-4">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><Plane className="w-4 h-4 text-blue-500" /> Flights</h3>
              {flights.length === 0 ? (
                <p className="text-xs text-gray-400">No flights today</p>
              ) : (
                <div className="space-y-2">
                  {flights.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-gray-50">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{flightLabel(s)}</div>
                        <div className="text-xs text-gray-500 truncate">{s.tripName} · {s.startTime ?? 'Time TBD'}</div>
                      </div>
                      <ServiceStatusBadge status={s.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Column 2 — Hotels */}
            <div className="bg-white rounded-2xl ring-1 ring-gray-100 p-4">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-emerald-500" /> Hotels</h3>
              {hotels.length === 0 ? (
                <p className="text-xs text-gray-400">No hotel activity today</p>
              ) : (
                <div className="space-y-2">
                  {hotels.map((s, i) => (
                    <div key={`${s.id}-${i}`} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-gray-50">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{hotelLabel(s)}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {s.tripName} · {s._kind}{s.details.roomType ? ` · ${s.details.roomType as string}` : ''}
                        </div>
                      </div>
                      <ServiceStatusBadge status={s.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Column 3 — Vehicles */}
            <div className="bg-white rounded-2xl ring-1 ring-gray-100 p-4">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><Car className="w-4 h-4 text-violet-500" /> Vehicles</h3>
              {data.vehicleSchedules.length === 0 ? (
                <p className="text-xs text-gray-400">No vehicle schedules today</p>
              ) : (
                <div className="space-y-2">
                  {data.vehicleSchedules.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-gray-50">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{vehicleLabel(s)}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {(s.details.driverName as string) ?? 'Driver TBD'} · {(s.details.driverPhone as string) ?? '—'}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {s.startTime ?? 'Time TBD'} · {(s.details.pickup as string) ?? 'Pickup TBD'}
                        </div>
                      </div>
                      <ServiceStatusBadge status={s.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section D — Pending confirmations */}
          <div ref={confirmationsRef} className="bg-white rounded-2xl ring-1 ring-gray-100 p-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3">Pending confirmations</h3>
            {data.pendingConfirmations.length === 0 ? (
              <p className="text-xs text-gray-400">Nothing pending confirmation</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                      <th className="py-2 pr-3">Trip</th>
                      <th className="py-2 pr-3">Service type</th>
                      <th className="py-2 pr-3">Supplier</th>
                      <th className="py-2 pr-3">Service date</th>
                      <th className="py-2 pr-3">Hours remaining</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pendingConfirmations.map(s => {
                      const hrs = hoursRemaining(s.serviceDate);
                      return (
                        <tr key={s.id} className={cn('border-t border-gray-50', hrs < 24 && 'bg-red-50')}>
                          <td className="py-2 pr-3 font-medium text-gray-800">
                            <button className="hover:underline" onClick={() => navigate(`/trips/${s.tripId}/timeline`)}>{s.tripName}</button>
                          </td>
                          <td className="py-2 pr-3">{s.type}</td>
                          <td className="py-2 pr-3">{s.supplierName ?? 'Not assigned'}</td>
                          <td className="py-2 pr-3">{format(parseISO(s.serviceDate), 'dd/MM/yyyy')}</td>
                          <td className={cn('py-2 pr-3 font-medium', hrs < 24 ? 'text-red-600' : 'text-gray-600')}>{hrs}h</td>
                          <td className="py-2 pr-3"><ServiceStatusBadge status={s.status} /></td>
                          <td className="py-2 pr-3">
                            <button
                              onClick={() => markConfirmed(s.id)}
                              disabled={confirming[s.id]}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {confirming[s.id] ? 'Confirming…' : 'Mark Confirmed'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section E — Pending payments */}
          <div ref={paymentsRef} className="bg-white rounded-2xl ring-1 ring-gray-100 p-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3">Pending payments</h3>
            {data.pendingPayments.length === 0 ? (
              <p className="text-xs text-gray-400">No outstanding payments due soon</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 pr-3">Trip</th>
                      <th className="py-2 pr-3">Amount due</th>
                      <th className="py-2 pr-3">Days to departure</th>
                      <th className="py-2 pr-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pendingPayments.map(p => (
                      <tr key={p.tripId} className="border-t border-gray-50">
                        <td className="py-2 pr-3 font-medium text-gray-800">{p.customerName}</td>
                        <td className="py-2 pr-3">
                          <button className="hover:underline" onClick={() => navigate(`/trips/${p.tripId}/timeline`)}>{p.tripName}</button>
                        </td>
                        <td className="py-2 pr-3">{formatCurrency(p.amountDue)}</td>
                        <td className="py-2 pr-3">{p.daysUntilDeparture}d</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => sendPaymentReminder(p)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                            >
                              {reminderSent[p.tripId] ? 'Reminder sent ✓' : 'Send Reminder'}
                            </button>
                            <button
                              onClick={() => setAiPanelPayment(p)}
                              title="Generate AI message"
                              className="px-2 py-1 rounded-lg bg-white ring-1 ring-gray-200 text-xs font-semibold hover:bg-gray-50"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section F — Upcoming risks */}
          <div ref={risksRef} className="space-y-3">
            <h3 className="text-sm font-bold text-gray-800">Upcoming risks</h3>
            {data.upcomingRisks.length === 0 ? (
              <p className="text-xs text-gray-400">No departures at risk in the next 48 hours</p>
            ) : (
              data.upcomingRisks.map(risk => (
                <div key={risk.tripId} className="bg-white rounded-2xl ring-1 ring-red-100 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <button className="text-sm font-bold text-gray-800 hover:underline" onClick={() => navigate(`/trips/${risk.tripId}/timeline`)}>
                      {risk.tripName}
                    </button>
                    <span className="text-xs text-gray-500">
                      Departs {format(parseISO(risk.departureDate), 'dd/MM/yyyy')} · {risk.hoursUntilDeparture}h away
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {risk.unconfirmedServices.map(s => (
                      <div key={s.id} className="flex items-center gap-2 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                        <span className="text-gray-700">{s.type}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-500">{s.supplierName ?? 'No supplier assigned'}</span>
                        <ServiceStatusBadge status={s.status} />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {aiPanelPayment && (
        <AiMessagePanel
          tripId={aiPanelPayment.tripId}
          customerPhone={aiPanelPayment.customerPhone}
          initialType="payment-reminder"
          onClose={() => setAiPanelPayment(null)}
        />
      )}
    </div>
  );
}
