import { useMemo, useState } from 'react';
import {
  Plus, Pencil, Trash2, Plane, Building2, Car, Camera, ArrowLeftRight,
  FileText, Shield, Package, CheckCircle2, Clock,
} from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { useStore } from '@/store';
import { useTripServices } from '@/shared/hooks/useTripServices';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { formatCurrency } from '@/shared/utils/format';
import { fmtDate, today } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Badge } from '@/shared/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/shared/components/ui/dialog';
import type { TripService, TripServiceType, TripServiceStatus } from '@/shared/types';

interface TripServicesPanelProps {
  tripId: string;
}

// ─── Static config ──────────────────────────────────────────────

const SERVICE_TYPES: Array<{ value: TripServiceType; label: string; Icon: typeof Plane }> = [
  { value: 'FLIGHT',    label: 'Flight',    Icon: Plane },
  { value: 'HOTEL',     label: 'Hotel',     Icon: Building2 },
  { value: 'VEHICLE',   label: 'Vehicle',   Icon: Car },
  { value: 'ACTIVITY',  label: 'Activity',  Icon: Camera },
  { value: 'TRANSFER',  label: 'Transfer',  Icon: ArrowLeftRight },
  { value: 'VISA',      label: 'Visa',      Icon: FileText },
  { value: 'INSURANCE', label: 'Insurance', Icon: Shield },
  { value: 'OTHER',     label: 'Other',     Icon: Package },
];

const TYPE_META = Object.fromEntries(SERVICE_TYPES.map(t => [t.value, t])) as
  Record<TripServiceType, { value: TripServiceType; label: string; Icon: typeof Plane }>;

// The schema's ServiceStatus has 7 values (legacy Operations workflow values
// included). The new panel only ever sets/displays these 4 buckets — legacy
// values are folded into the closest bucket.
type StatusGroup = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
type FilterValue = 'ALL' | StatusGroup;

const STATUS_GROUPS: Record<StatusGroup, TripServiceStatus[]> = {
  PENDING:   ['PENDING', 'DRAFT', 'REQUESTED'],
  CONFIRMED: ['CONFIRMED', 'VOUCHER_RECEIVED'],
  COMPLETED: ['COMPLETED'],
  CANCELLED: ['CANCELLED'],
};

function statusGroup(status: TripServiceStatus): StatusGroup {
  for (const [group, list] of Object.entries(STATUS_GROUPS) as [StatusGroup, TripServiceStatus[]][]) {
    if (list.includes(status)) return group;
  }
  return 'PENDING';
}

const STATUS_LABELS: Record<StatusGroup, string> = {
  PENDING:   'Pending',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_BAR_CLASS: Record<StatusGroup, string> = {
  PENDING:   'bg-amber-400',
  CONFIRMED: 'bg-blue-500',
  COMPLETED: 'bg-emerald-500',
  CANCELLED: 'bg-gray-300',
};

const STATUS_BADGE_VARIANT: Record<StatusGroup, 'warning' | 'default' | 'success' | 'secondary'> = {
  PENDING:   'warning',
  CONFIRMED: 'default',
  COMPLETED: 'success',
  CANCELLED: 'secondary',
};

// Allowed status transitions, keyed by current bucket → target buckets.
const STATUS_TRANSITIONS: Record<StatusGroup, StatusGroup[]> = {
  PENDING:   ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'PENDING', 'CANCELLED'],
  COMPLETED: ['CONFIRMED'],
  CANCELLED: ['PENDING'],
};

interface DetailField {
  key:   string;
  label: string;
  type?: 'text' | 'date' | 'number';
}

const DETAILS_FIELDS: Record<TripServiceType, DetailField[]> = {
  FLIGHT: [
    { key: 'airline',       label: 'Airline' },
    { key: 'flightNo',      label: 'Flight No' },
    { key: 'from',          label: 'From' },
    { key: 'to',            label: 'To' },
    { key: 'departureTime', label: 'Departure Time' },
    { key: 'arrivalTime',   label: 'Arrival Time' },
    { key: 'pnr',           label: 'PNR' },
  ],
  HOTEL: [
    { key: 'propertyName',   label: 'Property Name' },
    { key: 'roomType',       label: 'Room Type' },
    { key: 'checkIn',        label: 'Check-in Date', type: 'date' },
    { key: 'checkOut',       label: 'Check-out Date', type: 'date' },
    { key: 'confirmationNo', label: 'Confirmation No' },
  ],
  VEHICLE: [
    { key: 'vehicleType',     label: 'Vehicle Type' },
    { key: 'driverName',      label: 'Driver Name' },
    { key: 'driverPhone',     label: 'Driver Phone' },
    { key: 'pickupLocation',  label: 'Pickup Location' },
    { key: 'dropLocation',    label: 'Drop Location' },
    { key: 'reportingTime',   label: 'Reporting Time' },
  ],
  ACTIVITY: [
    { key: 'activityName',  label: 'Activity Name' },
    { key: 'location',      label: 'Location' },
    { key: 'duration',      label: 'Duration' },
    { key: 'guideName',     label: 'Guide Name' },
    { key: 'reportingTime', label: 'Reporting Time' },
  ],
  TRANSFER: [
    { key: 'from',        label: 'From' },
    { key: 'to',          label: 'To' },
    { key: 'vehicleType', label: 'Vehicle Type' },
    { key: 'driverName',  label: 'Driver Name' },
    { key: 'driverPhone', label: 'Driver Phone' },
  ],
  VISA: [
    { key: 'country',         label: 'Country' },
    { key: 'visaType',        label: 'Visa Type' },
    { key: 'applicationDate', label: 'Application Date', type: 'date' },
    { key: 'appointmentDate', label: 'Appointment Date', type: 'date' },
    { key: 'statusNotes',     label: 'Status Notes' },
  ],
  INSURANCE: [
    { key: 'provider',     label: 'Provider' },
    { key: 'policyNo',     label: 'Policy No' },
    { key: 'coverageType', label: 'Coverage Type' },
    { key: 'startDate',    label: 'Start Date', type: 'date' },
    { key: 'endDate',      label: 'End Date', type: 'date' },
    { key: 'amount',       label: 'Amount', type: 'number' },
  ],
  OTHER: [
    { key: 'description', label: 'Description' },
    { key: 'reference',   label: 'Reference' },
  ],
};

interface ServiceFormState {
  type:        TripServiceType;
  status:      TripServiceStatus;
  serviceDate: string;
  startTime:   string;
  endTime:     string;
  supplierId:  string;
  costPrice:   string;
  markup:      string;
  notes:       string;
  details:     Record<string, string>;
}

function emptyForm(): ServiceFormState {
  return {
    type:        'FLIGHT',
    status:      'PENDING',
    serviceDate: today(),
    startTime:   '',
    endTime:     '',
    supplierId:  '',
    costPrice:   '0',
    markup:      '0',
    notes:       '',
    details:     {},
  };
}

function formFromService(s: TripService): ServiceFormState {
  const details: Record<string, string> = {};
  for (const [key, val] of Object.entries(s.details ?? {})) {
    details[key] = val === null || val === undefined ? '' : String(val);
  }
  return {
    type:        s.type,
    status:      s.status,
    serviceDate: s.serviceDate.slice(0, 10),
    startTime:   s.startTime ?? '',
    endTime:     s.endTime ?? '',
    supplierId:  s.supplierId ?? '',
    costPrice:   String(s.costPrice ?? 0),
    markup:      String((s.sellPrice ?? 0) - (s.costPrice ?? 0)),
    notes:       s.notes ?? '',
    details,
  };
}

const SELECT_CLASS =
  'flex h-9 w-full rounded-xl border border-gray-200 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 hover:border-gray-300 transition-all duration-150';

// ─── Component ────────────────────────────────────────────────────

export function TripServicesPanel({ tripId }: TripServicesPanelProps) {
  const { services, loading, error, refetch } = useTripServices(tripId);
  const vendors = useStore(s => s.vendors);
  const { can, isAdmin, isBooking } = usePermissions();

  const canWrite  = can('trip-services:write');
  const canStatus = canWrite || can('trip-services:status');
  const showMoney = isAdmin || isBooking;

  const [filter, setFilter]           = useState<FilterValue>('ALL');
  const [formOpen, setFormOpen]       = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [form, setForm]               = useState<ServiceFormState>(emptyForm());
  const [saving, setSaving]           = useState(false);
  const [justCompleted, setJustCompleted] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<StatusGroup, number> = { PENDING: 0, CONFIRMED: 0, COMPLETED: 0, CANCELLED: 0 };
    for (const s of services) c[statusGroup(s.status)]++;
    return c;
  }, [services]);

  const filtered = useMemo(() => {
    if (filter === 'ALL') return services;
    return services.filter(s => statusGroup(s.status) === filter);
  }, [services, filter]);

  const pendingServices = useMemo(
    () => services.filter(s => statusGroup(s.status) === 'PENDING'),
    [services],
  );

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEditForm(s: TripService) {
    setEditingId(s.id);
    setForm(formFromService(s));
    setFormOpen(true);
  }

  function setDetail(key: string, value: string) {
    setForm(f => ({ ...f, details: { ...f.details, [key]: value } }));
  }

  function selectType(type: TripServiceType) {
    setForm(f => ({ ...f, type, details: {} }));
  }

  const sellPrice = (Number(form.costPrice) || 0) + (Number(form.markup) || 0);

  const hotelNights = useMemo(() => {
    if (form.type !== 'HOTEL') return null;
    const { checkIn, checkOut } = form.details;
    if (!checkIn || !checkOut) return null;
    const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    if (Number.isNaN(ms)) return null;
    return Math.max(0, Math.round(ms / 86_400_000));
  }, [form.type, form.details.checkIn, form.details.checkOut]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const details: Record<string, unknown> = { ...form.details };
      if (form.type === 'HOTEL' && hotelNights !== null) {
        details.nights = hotelNights;
      }
      const payload = {
        tripId,
        type:        form.type,
        status:      form.status,
        serviceDate: form.serviceDate,
        startTime:   form.startTime || null,
        endTime:     form.endTime || null,
        supplierId:  form.supplierId || null,
        costPrice:   Number(form.costPrice) || 0,
        sellPrice,
        details,
        notes:       form.notes || null,
      };

      if (editingId) {
        await apiClient.put(`/trip-services/${editingId}`, payload);
        toast.success('Service updated');
      } else {
        await apiClient.post('/trip-services', payload);
        toast.success('Service added');
      }
      setFormOpen(false);
      await refetch();
    } catch (err) {
      toast.error('Failed to save service', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title:        'Delete this service?',
      description:  'This action cannot be undone.',
      confirmLabel: 'Delete',
      variant:      'destructive',
    });
    if (!ok) return;
    try {
      await apiClient.delete(`/trip-services/${id}`);
      toast.success('Service deleted');
      await refetch();
    } catch {
      toast.error('Failed to delete service');
    }
  }

  async function handleStatusChange(id: string, status: StatusGroup) {
    try {
      await apiClient.put(`/trip-services/${id}`, { status });
      if (status === 'COMPLETED') {
        setJustCompleted(id);
        setTimeout(() => setJustCompleted(null), 1200);
      }
      await refetch();
    } catch {
      toast.error('Failed to update status');
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-500">Loading services…</div>;
  }

  if (error) {
    return <div className="py-12 text-center text-sm text-red-500">{error}</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-gray-900 font-display">Services</h3>
          <Badge variant="secondary">{services.length}</Badge>
        </div>
        {canWrite && (
          <Button size="sm" onClick={openAddForm}>
            <Plus className="h-4 w-4" /> Add Service
          </Button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as StatusGroup[]).map(group => (
          <button
            key={group}
            type="button"
            onClick={() => setFilter(filter === group ? 'ALL' : group)}
            className={cn(
              'rounded-xl border p-3 text-left transition-all duration-150',
              filter === group
                ? 'border-indigo-400 ring-2 ring-indigo-500/30 bg-indigo-50/50'
                : 'border-gray-200 bg-white hover:border-gray-300',
            )}
          >
            <div className="text-xs font-medium text-gray-500">{STATUS_LABELS[group]}</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">{counts[group]}</div>
          </button>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {(['ALL', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as FilterValue[]).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {f === 'ALL' ? `All (${services.length})` : `${STATUS_LABELS[f]} (${counts[f]})`}
          </button>
        ))}
      </div>

      {/* Pending actions */}
      {pendingServices.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <Clock className="h-3.5 w-3.5" /> Pending Actions
          </div>
          {pendingServices.map(s => {
            const { Icon, label } = TYPE_META[s.type];
            return (
              <div key={s.id} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-amber-100 px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-gray-800 min-w-0">
                  <Icon className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="truncate">{label} · {fmtDate(s.serviceDate)}</span>
                </div>
                {canStatus && (
                  <Button
                    size="sm"
                    variant="success"
                    className={cn(justCompleted === s.id && 'animate-pulse')}
                    onClick={() => handleStatusChange(s.id, 'COMPLETED')}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark Complete
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Service list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-400">No services found.</div>
        )}
        {filtered.map(s => {
          const group = statusGroup(s.status);
          const { Icon, label } = TYPE_META[s.type];
          const margin = s.sellPrice - s.costPrice;
          return (
            <div
              key={s.id}
              className={cn(
                'flex rounded-xl border border-gray-200 bg-white overflow-hidden transition-shadow',
                justCompleted === s.id && 'ring-2 ring-emerald-400',
              )}
            >
              <div className={cn('w-1.5 shrink-0', STATUS_BAR_CLASS[group])} />
              <div className="flex-1 p-3 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icon className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="text-sm font-semibold text-gray-900">{label}</span>
                    <span className="text-xs text-gray-500">{fmtDate(s.serviceDate)}</span>
                    <Badge variant={STATUS_BADGE_VARIANT[group]}>{STATUS_LABELS[group]}</Badge>
                  </div>
                  {(s.startTime || s.endTime) && (
                    <div className="text-xs text-gray-500">
                      {s.startTime ?? '—'} {s.endTime ? `→ ${s.endTime}` : ''}
                    </div>
                  )}
                  {s.supplierName && (
                    <div className="text-xs text-gray-500">Supplier: {s.supplierName}</div>
                  )}
                  {s.notes && (
                    <div className="text-xs text-gray-400 truncate max-w-md">{s.notes}</div>
                  )}
                  {showMoney && (
                    <div className="text-xs text-gray-600 flex items-center gap-2 pt-0.5">
                      <span>Cost: {formatCurrency(s.costPrice)}</span>
                      <span>→</span>
                      <span>Sell: {formatCurrency(s.sellPrice)}</span>
                      <span className={cn('font-medium', margin >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                        Margin: {formatCurrency(margin)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {canStatus && STATUS_TRANSITIONS[group].length > 0 && (
                    <select
                      className={cn(SELECT_CLASS, 'h-7 w-auto text-xs px-2')}
                      value=""
                      onChange={e => {
                        if (e.target.value) handleStatusChange(s.id, e.target.value as StatusGroup);
                        e.target.value = '';
                      }}
                    >
                      <option value="">Change status…</option>
                      {STATUS_TRANSITIONS[group].map(target => (
                        <option key={target} value={target}>{STATUS_LABELS[target]}</option>
                      ))}
                    </select>
                  )}
                  {canWrite && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => openEditForm(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit form */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Service' : 'Add Service'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <DialogBody>
              {/* Type selector grid */}
              <div>
                <Label>Service Type</Label>
                <div className="grid grid-cols-4 gap-2 mt-1.5">
                  {SERVICE_TYPES.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => selectType(value)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs font-medium transition-all duration-150',
                        form.type === value
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/30'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Common fields */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label required>Service Date</Label>
                  <Input type="date" value={form.serviceDate}
                    onChange={e => setForm(f => ({ ...f, serviceDate: e.target.value }))} required />
                </div>
                <div>
                  <Label>Start Time</Label>
                  <Input type="time" value={form.startTime}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input type="time" value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Supplier</Label>
                  <select
                    className={SELECT_CLASS}
                    value={form.supplierId}
                    onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}
                  >
                    <option value="">— None —</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    className={SELECT_CLASS}
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as TripServiceStatus }))}
                  >
                    {(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as TripServiceStatus[]).map(st => (
                      <option key={st} value={st}>{STATUS_LABELS[st as StatusGroup]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {showMoney && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Cost Price</Label>
                    <Input type="number" min="0" step="0.01" value={form.costPrice}
                      onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Markup</Label>
                    <Input type="number" step="0.01" value={form.markup}
                      onChange={e => setForm(f => ({ ...f, markup: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Sell Price</Label>
                    <Input type="number" value={sellPrice.toFixed(2)} disabled />
                  </div>
                </div>
              )}

              {/* Type-specific details */}
              <div className="border-t border-gray-100 pt-3">
                <Label>{TYPE_META[form.type].label} Details</Label>
                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  {DETAILS_FIELDS[form.type].map(field => (
                    <div key={field.key}>
                      <Label>{field.label}</Label>
                      <Input
                        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                        value={form.details[field.key] ?? ''}
                        onChange={e => setDetail(field.key, e.target.value)}
                      />
                    </div>
                  ))}
                  {form.type === 'HOTEL' && hotelNights !== null && (
                    <div>
                      <Label>Nights (auto)</Label>
                      <Input value={hotelNights} disabled />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{editingId ? 'Save Changes' : 'Add Service'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
