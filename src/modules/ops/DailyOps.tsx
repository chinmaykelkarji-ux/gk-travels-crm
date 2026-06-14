import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plane, Hotel, Train, Car, CheckSquare, FileSearch,
  ChevronRight, MapPin, Clock, IndianRupee, AlertTriangle,
} from 'lucide-react';
import { useStore } from '@/store';
import apiClient from '@/lib/apiClient';
import { today, fmtDate } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import type { Booking, TripServiceType } from '@/shared/types';

const todayStr = today();

function getDetail(b: Booking): Record<string, string> {
  return ((b.detail ?? {}) as Record<string, string | undefined>) as Record<string, string>;
}

// Raw row shape returned by GET /api/trip-services/upcoming (no DTO transform).
interface UpcomingTripService {
  id:          string;
  tripId:      string;
  type:        TripServiceType;
  status:      string;
  serviceDate: string;
  startTime:   string | null;
  endTime:     string | null;
  details:     Record<string, unknown>;
  notes:       string | null;
}

interface OpsSection {
  label:    string;
  icon:     React.ElementType;
  color:    string;
  bg:       string;
  items:    OpsItem[];
}

interface OpsItem {
  id:       string;
  title:    string;
  subtitle: string;
  time?:    string;
  url:      string;
  status:   string;
  statusColor: string;
}

export default function DailyOps() {
  const navigate      = useNavigate();
  const bookings      = useStore(s => s.bookings);
  const vendorPayments = useStore(s => s.vendorPayments);
  const trips         = useStore(s => s.trips);

  // TripService records for today + tomorrow (the legacy Booking-based
  // sections below only cover the old bookings model).
  const [tripServices, setTripServices] = useState<UpcomingTripService[]>([]);

  useEffect(() => {
    let mounted = true;
    apiClient.get<UpcomingTripService[]>('/trip-services/upcoming', { params: { days: 1 } })
      .then(res => { if (mounted) setTripServices(res.data); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const sections = useMemo((): OpsSection[] => {

    // Flights departing today
    const departures = bookings
      .filter(b => b.type === 'flight' && getDetail(b).departDate === todayStr)
      .map(b => {
        const d = getDetail(b);
        return {
          id:          b.id,
          title:       `${d.airline ?? 'Flight'} ${d.flightNumber ?? ''}`.trim(),
          subtitle:    `${d.origin ?? '?'} → ${d.destination ?? '?'} · ${b.customerName}`,
          time:        d.departTime,
          url:         `/bookings/${b.id}`,
          status:      b.status,
          statusColor: b.status === 'issued' ? 'text-emerald-600' : 'text-amber-600',
        };
      });

    // Flights arriving today
    const arrivals = bookings
      .filter(b => b.type === 'flight' && getDetail(b).arrivalDate === todayStr)
      .map(b => {
        const d = getDetail(b);
        return {
          id:          b.id,
          title:       `${d.airline ?? 'Flight'} ${d.flightNumber ?? ''}`.trim(),
          subtitle:    `${d.origin ?? '?'} → ${d.destination ?? '?'} · ${b.customerName}`,
          time:        d.arrivalTime,
          url:         `/bookings/${b.id}`,
          status:      b.status,
          statusColor: b.status === 'issued' ? 'text-emerald-600' : 'text-amber-600',
        };
      });

    // Hotel check-ins today
    const checkIns = bookings
      .filter(b => b.type === 'hotel' && getDetail(b).checkIn === todayStr)
      .map(b => {
        const d = getDetail(b);
        return {
          id:          b.id,
          title:       d.hotelName ?? 'Hotel',
          subtitle:    `${d.city ?? ''} · ${b.customerName}`.trim().replace(/^· /, ''),
          url:         `/bookings/${b.id}`,
          status:      b.status,
          statusColor: b.status === 'confirmed' || b.status === 'issued' ? 'text-emerald-600' : 'text-amber-600',
        };
      });

    // Hotel check-outs today
    const checkOuts = bookings
      .filter(b => b.type === 'hotel' && getDetail(b).checkOut === todayStr)
      .map(b => {
        const d = getDetail(b);
        return {
          id:          b.id,
          title:       d.hotelName ?? 'Hotel',
          subtitle:    `${d.city ?? ''} · ${b.customerName}`.trim().replace(/^· /, ''),
          url:         `/bookings/${b.id}`,
          status:      b.status,
          statusColor: 'text-blue-600',
        };
      });

    // Sightseeing / activities today
    const activities = bookings
      .filter(b => b.type === 'activity' && getDetail(b).date === todayStr)
      .map(b => {
        const d = getDetail(b);
        return {
          id:          b.id,
          title:       d.activityName ?? 'Activity',
          subtitle:    `${d.location ?? ''} · ${b.customerName}`.trim().replace(/^· /, ''),
          time:        d.time,
          url:         `/bookings/${b.id}`,
          status:      b.status,
          statusColor: 'text-purple-600',
        };
      });

    // Visa tasks — appointments or expected delivery today
    const visaTasks = bookings
      .filter(b => {
        if (b.type !== 'visa') return false;
        const d = getDetail(b);
        return d.appointmentDate === todayStr || d.expectedDate === todayStr;
      })
      .map(b => {
        const d = getDetail(b);
        const isAppt = d.appointmentDate === todayStr;
        return {
          id:          b.id,
          title:       `${d.country ?? 'Visa'} — ${b.customerName}`,
          subtitle:    isAppt ? 'Appointment today' : 'Expected delivery today',
          url:         `/bookings/${b.id}`,
          status:      b.status,
          statusColor: b.status === 'approved' ? 'text-emerald-600' : 'text-amber-600',
        };
      });

    // Vendor payments due today
    const vendorDue = vendorPayments
      .filter(vp => vp.dueDate === todayStr && !vp.isPaid)
      .map(vp => {
        const trip = vp.tripId ? trips.find(t => t.id === vp.tripId) : undefined;
        return {
          id:          vp.id,
          title:       `${vp.vendorName} — ${formatCurrency(vp.totalCost)}`,
          subtitle:    trip ? `Trip: ${trip.customer} — ${trip.destination}` : 'Supplier payment due',
          url:         `/vendors`,
          status:      'due today',
          statusColor: 'text-red-600',
        };
      });

    // ── TripService records (today + tomorrow) ────────────────────
    const serviceItem = (s: UpcomingTripService, subtitle: string, time?: string | null): OpsItem => ({
      id:          s.id,
      title:       subtitle,
      subtitle:    `Trip ${s.tripId}${trips.find(t => t.id === s.tripId)?.customer ? ` · ${trips.find(t => t.id === s.tripId)?.customer}` : ''} · ${fmtDate(s.serviceDate)}`,
      time:        time ?? undefined,
      url:         `/trips/${s.tripId}`,
      status:      s.status.toLowerCase(),
      statusColor: s.status === 'CONFIRMED' || s.status === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-600',
    });

    const flightServices = tripServices
      .filter(s => s.type === 'FLIGHT')
      .map(s => {
        const d = s.details as Record<string, string>;
        return serviceItem(s, `${d.airline ?? 'Flight'} ${d.flightNo ?? ''}`.trim() || 'Flight', s.startTime);
      });

    const hotelServices = tripServices
      .filter(s => s.type === 'HOTEL' && s.serviceDate.slice(0, 10) === todayStr)
      .map(s => {
        const d = s.details as Record<string, string>;
        return serviceItem(s, d.hotelName ?? 'Hotel', s.startTime);
      });

    const vehicleServices = tripServices
      .filter(s => s.type === 'VEHICLE')
      .map(s => {
        const d = s.details as Record<string, string>;
        return serviceItem(s, d.vehicleType ?? d.vendorName ?? 'Vehicle', s.startTime);
      });

    const activityServices = tripServices
      .filter(s => s.type === 'ACTIVITY')
      .map(s => {
        const d = s.details as Record<string, string>;
        return serviceItem(s, d.activityName ?? 'Activity', s.startTime);
      });

    return [
      { label: 'Departures',        icon: Plane,       color: 'text-blue-600',    bg: 'bg-blue-50',    items: [...departures, ...flightServices] },
      { label: 'Arrivals',          icon: Plane,       color: 'text-emerald-600', bg: 'bg-emerald-50', items: arrivals    },
      { label: 'Hotel Check-Ins',   icon: Hotel,       color: 'text-indigo-600',  bg: 'bg-indigo-50',  items: [...checkIns, ...hotelServices] },
      { label: 'Hotel Check-Outs',  icon: Hotel,       color: 'text-purple-600',  bg: 'bg-purple-50',  items: checkOuts   },
      { label: 'Vehicle Schedule',  icon: Car,         color: 'text-cyan-600',    bg: 'bg-cyan-50',    items: vehicleServices },
      { label: 'Activities',        icon: MapPin,      color: 'text-amber-600',   bg: 'bg-amber-50',   items: [...activities, ...activityServices] },
      { label: 'Visa Tasks',        icon: FileSearch,  color: 'text-teal-600',    bg: 'bg-teal-50',    items: visaTasks   },
      { label: 'Supplier Payments', icon: IndianRupee, color: 'text-red-600',     bg: 'bg-red-50',     items: vendorDue   },
    ].filter(s => s.items.length > 0);
  }, [bookings, vendorPayments, trips, tripServices]);

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 font-display">Daily Operations</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {fmtDate(todayStr)} · {totalItems === 0 ? 'Nothing scheduled for today' : `${totalItems} item${totalItems !== 1 ? 's' : ''} scheduled`}
        </p>
      </div>

      {totalItems === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 text-center py-20">
          <CheckSquare className="w-12 h-12 text-emerald-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">All clear — nothing scheduled for today</p>
          <p className="text-gray-400 text-xs mt-1">Flights, hotel check-ins, activities, visa tasks and supplier payments will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sections.map(section => {
            const Icon = section.icon;
            return (
              <div key={section.label} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {/* Section header */}
                <div className={cn('flex items-center gap-3 px-4 py-3 border-b border-gray-100', section.bg)}>
                  <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center bg-white shadow-sm')}>
                    <Icon className={cn('w-4 h-4', section.color)} />
                  </div>
                  <h3 className={cn('text-sm font-bold', section.color)}>{section.label}</h3>
                  <span className="ml-auto text-xs font-semibold text-gray-500 bg-white rounded-full px-2 py-0.5 shadow-sm">
                    {section.items.length}
                  </span>
                </div>

                {/* Items */}
                <div className="divide-y divide-gray-50">
                  {section.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.url)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{item.title}</p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{item.subtitle}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {item.time && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            {item.time}
                          </span>
                        )}
                        <span className={cn('text-[11px] font-semibold capitalize', item.statusColor)}>
                          {item.status}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Train departures */}
      {/* Trains use different date field — injected inline since they appear less often */}
      <TrainSection bookings={bookings} navigate={navigate} />
    </div>
  );
}

function TrainSection({ bookings, navigate }: { bookings: Booking[]; navigate: (url: string) => void }) {
  const trains = useMemo(() =>
    bookings.filter(b => b.type === 'train' && getDetail(b).departure === todayStr),
    [bookings]
  );

  if (trains.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-orange-50">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-white shadow-sm">
          <Train className="w-4 h-4 text-orange-600" />
        </div>
        <h3 className="text-sm font-bold text-orange-600">Train Departures</h3>
        <span className="ml-auto text-xs font-semibold text-gray-500 bg-white rounded-full px-2 py-0.5 shadow-sm">{trains.length}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {trains.map(b => {
          const d = getDetail(b);
          return (
            <button
              key={b.id}
              onClick={() => navigate(`/bookings/${b.id}`)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {d.trainName ?? d.trainNumber ?? 'Train'} · {b.customerName}
                </p>
                <p className="text-xs text-gray-400 truncate mt-0.5">
                  {d.fromStation ?? '?'} → {d.toStation ?? '?'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {d.departureTime && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    {d.departureTime}
                  </span>
                )}
                <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
