import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, parseISO, isValid } from 'date-fns';
import {
  ArrowLeft, Plane, Building2, Car, Camera, ArrowRightLeft,
  CheckCircle2, Circle, XCircle, Clock, AlertTriangle, Pencil,
} from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { ServiceStatusBadge } from '@/shared/components/ServiceStatusBadge';
import { cn } from '@/shared/utils/cn';
import { toast } from '@/shared/hooks/useToast';
import type { ServiceStatus, ServiceType, TripServiceDTO } from '@/shared/types/operations';

// ── Time helpers ──────────────────────────────────────────────────

function toMinutes(time: string | null): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// ── Display helpers ───────────────────────────────────────────────

const TYPE_ICONS: Record<ServiceType, React.ElementType> = {
  FLIGHT:   Plane,
  HOTEL:    Building2,
  VEHICLE:  Car,
  ACTIVITY: Camera,
  TRANSFER: ArrowRightLeft,
};

const STATUS_ICONS: Record<ServiceStatus, { icon: React.ElementType; className: string }> = {
  DRAFT:            { icon: Circle,       className: 'text-gray-400' },
  REQUESTED:        { icon: Clock,        className: 'text-amber-500' },
  CONFIRMED:        { icon: CheckCircle2, className: 'text-emerald-500' },
  VOUCHER_RECEIVED: { icon: CheckCircle2, className: 'text-blue-500' },
  CANCELLED:        { icon: XCircle,      className: 'text-red-500' },
};

const LINE_COLORS: Record<ServiceStatus, string> = {
  DRAFT:            'bg-gray-300',
  REQUESTED:        'bg-amber-400',
  CONFIRMED:        'bg-emerald-400',
  VOUCHER_RECEIVED: 'bg-blue-400',
  CANCELLED:        'bg-red-400',
};

function serviceTitle(s: TripServiceDTO): string {
  switch (s.type) {
    case 'FLIGHT': {
      const airline = s.details.airline as string | undefined;
      const flightNo = s.details.flightNo as string | undefined;
      return [airline, flightNo].filter(Boolean).join(' ') || 'Flight TBD';
    }
    case 'HOTEL':
      return (s.details.propertyName as string) ?? 'Hotel TBD';
    case 'VEHICLE':
      return (s.details.vehicleType as string) ?? 'Vehicle TBD';
    case 'ACTIVITY':
      return (s.details.name as string) ?? 'Activity TBD';
    case 'TRANSFER': {
      const from = (s.details.from as string) ?? '?';
      const to = (s.details.to as string) ?? '?';
      return `Transfer: ${from} → ${to}`;
    }
    default:
      return s.type;
  }
}

function serviceSubtitle(s: TripServiceDTO): string {
  switch (s.type) {
    case 'FLIGHT': {
      const from = (s.details.from as string) ?? '?';
      const to = (s.details.to as string) ?? '?';
      return `${from} → ${to}`;
    }
    case 'HOTEL':
      return [s.details.roomType as string | undefined, s.supplierName].filter(Boolean).join(' · ') || 'No supplier assigned';
    case 'VEHICLE':
    case 'TRANSFER':
      return [s.details.driverName as string | undefined, s.details.driverPhone as string | undefined].filter(Boolean).join(' · ') || 'Driver TBD';
    case 'ACTIVITY':
      return [s.details.location as string | undefined, s.supplierName].filter(Boolean).join(' · ') || 'No supplier assigned';
    default:
      return s.supplierName ?? 'No supplier assigned';
  }
}

// ── Day grouping + warning detection ────────────────────────────

interface DayWarning {
  afterIndex: number; // render after this service index within the day
  kind: 'conflict' | 'gap' | 'missing-pickup';
  message: string;
}

interface DayGroup {
  date: string;
  dayLabel: string;
  services: TripServiceDTO[];
  warnings: DayWarning[];
}

function buildDayGroups(services: TripServiceDTO[]): DayGroup[] {
  const byDate = new Map<string, TripServiceDTO[]>();
  for (const s of services) {
    const d = parseISO(s.serviceDate);
    const key = isValid(d) ? format(d, 'yyyy-MM-dd') : 'unknown';
    const arr = byDate.get(key) ?? [];
    arr.push(s);
    byDate.set(key, arr);
  }

  const dates = [...byDate.keys()].sort();

  return dates.map((date, dayIndex) => {
    const dayServices = [...byDate.get(date)!].sort((a, b) => {
      const ma = toMinutes(a.startTime);
      const mb = toMinutes(b.startTime);
      if (ma === null && mb === null) return 0;
      if (ma === null) return 1;
      if (mb === null) return -1;
      return ma - mb;
    });

    const warnings: DayWarning[] = [];

    // Conflict detection — every pair with both start & end times that overlap
    for (let i = 0; i < dayServices.length; i++) {
      for (let j = i + 1; j < dayServices.length; j++) {
        const a = dayServices[i];
        const b = dayServices[j];
        const aStart = toMinutes(a.startTime);
        const aEnd = toMinutes(a.endTime);
        const bStart = toMinutes(b.startTime);
        const bEnd = toMinutes(b.endTime);
        if (aStart === null || aEnd === null || bStart === null || bEnd === null) continue;
        if (aStart < bEnd && bStart < aEnd) {
          warnings.push({
            afterIndex: Math.max(i, j) - 1,
            kind: 'conflict',
            message: `⚠ Timing conflict: ${a.type} ends at ${a.endTime} but ${b.type} starts at ${b.startTime}`,
          });
        }
      }
    }

    // Gap detection — consecutive services with > 180 min gap and no
    // VEHICLE/TRANSFER service in between.
    for (let i = 0; i < dayServices.length - 1; i++) {
      const cur = dayServices[i];
      const next = dayServices[i + 1];
      const curEnd = toMinutes(cur.endTime);
      const nextStart = toMinutes(next.startTime);
      if (curEnd === null || nextStart === null) continue;
      const gap = nextStart - curEnd;
      if (gap > 180) {
        const hasTransfer = dayServices.some((s, idx) =>
          idx > i && idx <= i + 1 && (s.type === 'VEHICLE' || s.type === 'TRANSFER'),
        ) || cur.type === 'VEHICLE' || cur.type === 'TRANSFER' || next.type === 'VEHICLE' || next.type === 'TRANSFER';
        if (!hasTransfer) {
          warnings.push({
            afterIndex: i,
            kind: 'gap',
            message: `No transfer arranged between ${cur.type} and ${next.type} (${(gap / 60).toFixed(1)} hour gap)`,
          });
        }
      }
    }

    // Missing pickup — FLIGHT arrival with no VEHICLE/TRANSFER within 120 min after
    dayServices.forEach((s, idx) => {
      if (s.type !== 'FLIGHT') return;
      if ((s.details.direction as string | undefined) !== 'IN') return;
      const arrival = toMinutes(s.endTime ?? s.startTime);
      if (arrival === null) return;
      const hasPickup = dayServices.some(o => {
        if (o.type !== 'VEHICLE' && o.type !== 'TRANSFER') return false;
        const pickupStart = toMinutes(o.startTime);
        if (pickupStart === null) return false;
        return pickupStart >= arrival && pickupStart - arrival <= 120;
      });
      if (!hasPickup) {
        warnings.push({
          afterIndex: idx,
          kind: 'missing-pickup',
          message: '⚠ No airport pickup found after flight arrival',
        });
      }
    });

    return {
      date,
      dayLabel: date === 'unknown'
        ? `Day ${dayIndex + 1}`
        : `Day ${dayIndex + 1} — ${format(parseISO(date), 'EEEE, d MMMM yyyy')}`,
      services: dayServices,
      warnings,
    };
  });
}

// ── Inline edit form ──────────────────────────────────────────────

const STATUS_OPTIONS: ServiceStatus[] = ['DRAFT', 'REQUESTED', 'CONFIRMED', 'VOUCHER_RECEIVED', 'CANCELLED'];

interface EditFormProps {
  service: TripServiceDTO;
  onSave: (data: { status: ServiceStatus; notes: string; startTime: string; endTime: string }) => Promise<void>;
  onCancel: () => void;
}

function EditForm({ service, onSave, onCancel }: EditFormProps) {
  const [status, setStatus] = useState<ServiceStatus>(service.status);
  const [notes, setNotes] = useState(service.notes ?? '');
  const [startTime, setStartTime] = useState(service.startTime ?? '');
  const [endTime, setEndTime] = useState(service.endTime ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ status, notes, startTime, endTime });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 p-3 rounded-xl bg-gray-50 ring-1 ring-gray-100 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="text-xs text-gray-600">
          Status
          <select
            value={status}
            onChange={e => setStatus(e.target.value as ServiceStatus)}
            className="mt-1 w-full rounded-lg border border-gray-200 text-sm px-2 py-1.5"
          >
            {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Start time
          <input
            type="text"
            placeholder="HH:mm"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 text-sm px-2 py-1.5"
          />
        </label>
        <label className="text-xs text-gray-600">
          End time
          <input
            type="text"
            placeholder="HH:mm"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 text-sm px-2 py-1.5"
          />
        </label>
      </div>
      <label className="text-xs text-gray-600 block">
        Notes
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-gray-200 text-sm px-2 py-1.5"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg bg-white ring-1 ring-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export default function TripTimeline() {
  const { id: tripId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [services, setServices] = useState<TripServiceDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    try {
      const res = await apiClient.get<TripServiceDTO[]>('/trip-services', { params: { tripId } });
      setServices(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trip timeline');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void fetchServices();
  }, [fetchServices]);

  const dayGroups = useMemo(() => buildDayGroups(services ?? []), [services]);

  async function handleSave(serviceId: string, data: { status: ServiceStatus; notes: string; startTime: string; endTime: string }) {
    try {
      await apiClient.put(`/trip-services/${serviceId}`, {
        status:    data.status,
        notes:     data.notes,
        startTime: data.startTime || null,
        endTime:   data.endTime || null,
      });
      toast.success('Service updated');
      setEditingId(null);
      await fetchServices();
    } catch {
      toast.error('Failed to update service');
    }
  }

  if (loading && !services) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center gap-3 mt-20">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-gray-600">{error}</p>
        <button onClick={fetchServices} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {dayGroups.length === 0 ? (
        <p className="text-sm text-gray-400">No services scheduled for this trip yet.</p>
      ) : (
        dayGroups.map(day => (
          <div key={day.date}>
            <h2 className="text-sm font-bold text-gray-800 mb-3">{day.dayLabel}</h2>
            <div className="space-y-0">
              {day.services.map((s, idx) => {
                const StatusIcon = STATUS_ICONS[s.status].icon;
                const TypeIcon = TYPE_ICONS[s.type];
                const isLast = idx === day.services.length - 1;
                return (
                  <div key={s.id}>
                    <div className="flex gap-3">
                      {/* Timeline rail */}
                      <div className="flex flex-col items-center flex-shrink-0 w-6">
                        <StatusIcon className={cn('w-5 h-5', STATUS_ICONS[s.status].className)} />
                        {!isLast && <div className={cn('w-0.5 flex-1 mt-1', LINE_COLORS[s.status])} />}
                      </div>

                      {/* Card */}
                      <div className="flex-1 pb-4 min-w-0">
                        <div className="bg-white rounded-2xl ring-1 ring-gray-100 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <TypeIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <span className="text-xs font-medium text-gray-500 flex-shrink-0">{s.startTime ?? 'Time TBD'}</span>
                              <span className="text-sm font-semibold text-gray-800 truncate">{serviceTitle(s)}</span>
                            </div>
                            <button
                              onClick={() => setEditingId(editingId === s.id ? null : s.id)}
                              className="flex-shrink-0 p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 truncate">{serviceSubtitle(s)}</p>
                          <div className="mt-2">
                            <ServiceStatusBadge status={s.status} />
                          </div>

                          {editingId === s.id && (
                            <EditForm
                              service={s}
                              onSave={data => handleSave(s.id, data)}
                              onCancel={() => setEditingId(null)}
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Warnings rendered after this card */}
                    {day.warnings.filter(w => w.afterIndex === idx).map((w, wIdx) => (
                      <div key={wIdx} className="ml-9 mb-3">
                        <div className={cn(
                          'rounded-lg px-3 py-2 text-xs font-medium',
                          w.kind === 'gap' ? 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-700',
                        )}>
                          {w.message}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
