import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Calendar, Users, Phone, IndianRupee,
  Edit2, Trash2, CheckCircle, Clock, Plane, Hotel, Globe, Plus, Receipt,
  Car, Shield, Activity, User, FileText, Package, AlertTriangle,
  Bus, ExternalLink, Building2, CreditCard, ChevronRight,
} from 'lucide-react';
import { useStore, selectors } from '@/store';
import {
  FINANCIAL_STATUS_CLASS, FINANCIAL_STATUS_LABEL, getFinancialStatus,
  RECEIVABLE_STATUS_CLASS, RECEIVABLE_STATUS_LABEL, calcReceivableFinance,
} from '@/shared/utils/finance';
import { formatCurrency } from '@/shared/utils/format';
import { fmtDate, daysUntilLabel, daysUntil, today } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { RecordNumberBadge } from '@/shared/components/RecordNumberBadge';
import { canConfirmTrip } from '@/shared/schemas/trip';
import type { TripFormSchema } from '@/shared/schemas/trip';
import type { TripStatus, Payment, Receivable, BookingType } from '@/shared/types';
import { VOUCHER_TYPES, VOUCHER_STATUS_BADGE } from '@/modules/vouchers/Vouchers';
import {
  TYPE_ICON, TYPE_COLOR, DETAIL_FIELDS, getBookingPrimaryDate, STATUS_CONFIG,
} from '@/modules/bookings/bookingMeta';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components/ui/tabs';
import { Separator } from '@/shared/components/ui/separator';
import { TripForm } from './TripForm';
import { PaymentForm } from '@/shared/components/PaymentForm';
import { ReceivableForm } from '@/shared/components/ReceivableForm';
import { RecordReceiptForm } from '@/shared/components/RecordReceiptForm';
import { GmailButton } from '@/shared/components/GmailButton';
import { gmail } from '@/shared/utils/email';
import { ActivityTimeline } from '@/components/activity/ActivityTimeline';

const TRIP_STATUS_FLOW: TripStatus[] = [
  'draft', 'quotation', 'confirmed', 'in_progress', 'completed',
];

const TRAVEL_GROUPS: Array<{ type: BookingType; label: string; Icon: React.ElementType }> = [
  { type: 'flight',   label: 'Flights',           Icon: Plane    },
  { type: 'hotel',    label: 'Hotels',             Icon: Hotel    },
  { type: 'cab',      label: 'Transfers & Cabs',   Icon: Car      },
  { type: 'train',    label: 'Trains',             Icon: Package  },
  { type: 'activity', label: 'Activities',         Icon: Activity },
  { type: 'visa',     label: 'Visa',               Icon: Shield   },
  { type: 'bus',      label: 'Buses',              Icon: Bus      },
  { type: 'other',    label: 'Other',              Icon: Package  },
];

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs text-gray-800 font-medium">{value}</p>
    </div>
  );
}

export default function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const trip          = useStore(selectors.tripById(id ?? ''));
  const updateTrip    = useStore(s => s.updateTrip);
  const deleteTrip    = useStore(s => s.deleteTrip);
  const setTripStatus = useStore(s => s.setTripStatus);
  const payments      = useStore(selectors.paymentsForTrip(id ?? ''));
  const bookings      = useStore(selectors.bookingsForTrip(id ?? ''));
  const vouchers      = useStore(selectors.vouchersForTrip(id ?? ''));
  const vendorPayments = useStore(selectors.vendorPaymentsForTrip(id ?? ''));
  const itineraries   = useStore(selectors.itinerariesForTrip(id ?? ''));
  const recordPayment = useStore(s => s.recordPayment);
  const updatePayment = useStore(s => s.updatePayment);
  const deletePayment = useStore(s => s.deletePayment);
  const markVendorPaid = useStore(s => s.markVendorPaid);

  const activityLog        = useStore(s => s.activityLog);
  const communications     = useStore(s => s.communications);
  const allReceivables     = useStore(s => s.receivables);
  const createReceivable   = useStore(s => s.createReceivable);
  const deleteReceivable   = useStore(s => s.deleteReceivable);
  const addReceivableEntry = useStore(s => s.addReceivableEntry);
  const receivables        = allReceivables.filter(r => r.tripId === id);

  const customer = useStore(selectors.customerById(trip?.customerId ?? ''));

  const [editOpen,   setEditOpen]   = useState(false);
  const [payAmount,  setPayAmount]  = useState('');
  const [payMethod,  setPayMethod]  = useState('Cash');
  const [payFormOpen,    setPayFormOpen]    = useState(false);
  const [editPayment,    setEditPayment]    = useState<Payment | null>(null);
  const [editPayType,    setEditPayType]    = useState<'customer' | 'supplier'>('customer');
  const [recFormOpen,    setRecFormOpen]    = useState(false);
  const [recEntryOpen,   setRecEntryOpen]   = useState(false);
  const [activeReceivable, setActiveReceivable] = useState<Receivable | null>(null);

  const todayStr = today();

  const todaysBookings = useMemo(() =>
    bookings.filter(b => getBookingPrimaryDate(b) === todayStr && b.status !== 'cancelled'),
    [bookings, todayStr],
  );

  const todaysItineraryDays = useMemo(() =>
    itineraries.flatMap(it => it.days.filter(d => d.date === todayStr)),
    [itineraries, todayStr],
  );

  const durationDays = useMemo(() => {
    if (!trip?.departure || !trip?.returnDate) return null;
    try {
      const dep = new Date(trip.departure);
      const ret = new Date(trip.returnDate);
      const diff = Math.round((ret.getTime() - dep.getTime()) / (1000 * 60 * 60 * 24));
      return diff > 0 ? diff : null;
    } catch { return null; }
  }, [trip?.departure, trip?.returnDate]);

  // Passenger names extracted from flight/hotel booking details
  const passengerNames = useMemo(() => {
    const names = new Set<string>();
    for (const b of bookings) {
      const d = (b.detail ?? {}) as Record<string, unknown>;
      const raw = typeof d['passengerNames'] === 'string' ? d['passengerNames'] :
                  typeof d['guestNames']     === 'string' ? d['guestNames'] : '';
      if (raw) raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).forEach(n => names.add(n));
    }
    return Array.from(names);
  }, [bookings]);

  if (!trip) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Trip not found.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/trips')} className="mt-3">
          ← Back to Trips
        </Button>
      </div>
    );
  }

  const finStatus = getFinancialStatus(trip.totalPayable, trip.paidAmount);

  async function handleDelete() {
    const ok = await confirm({
      title:        `Delete ${trip!.id}?`,
      description:  `This will permanently delete the trip for ${trip!.customer}. This action cannot be undone.`,
      confirmLabel: 'Delete Trip',
      cancelLabel:  'Cancel',
      variant:      'destructive',
    });
    if (ok) {
      deleteTrip(id!);
      navigate('/trips');
      toast.success('Trip deleted');
    }
  }

  async function handleStatusChange(status: TripStatus) {
    const result = setTripStatus(id!, status);
    if (result.ok) {
      toast.success(`Status → ${status.replace(/_/g, ' ')}`);
    } else {
      toast.error('Cannot change status', result.reason);
    }
  }

  function handleEdit(data: TripFormSchema) {
    updateTrip(id!, {
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
    });
    toast.success('Trip updated');
    setEditOpen(false);
  }

  function handleRecordPayment() {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      toast.error('Invalid amount', 'Please enter a valid payment amount');
      return;
    }
    recordPayment({
      type:     'customer',
      tripId:   id,
      customer: trip!.customer,
      amount,
      method:   payMethod,
      date:     today(),
      status:   'received',
    });
    toast.success('Payment recorded', `₹${amount} received`);
    setPayAmount('');
  }

  function openEditPayment(p: Payment, type: 'customer' | 'supplier') {
    setEditPayment(p);
    setEditPayType(type);
    setPayFormOpen(true);
  }

  function handleSavePayment(data: Partial<Payment>) {
    if (editPayment) {
      updatePayment(editPayment.id, editPayType, data);
      toast.success('Payment updated');
    } else {
      recordPayment({ ...data, type: editPayType, tripId: id });
      toast.success('Payment recorded');
    }
    setPayFormOpen(false);
    setEditPayment(null);
  }

  async function handleDeletePayment(p: Payment, type: 'customer' | 'supplier') {
    const ok = await confirm({
      title:        'Delete payment?',
      description:  `This will remove the ₹${p.amount} payment record.`,
      confirmLabel: 'Delete',
      variant:      'destructive',
    });
    if (ok) {
      deletePayment(p.id, type);
      toast.success('Payment deleted');
    }
  }

  const confirmCheck = canConfirmTrip(trip);

  const hasOpsToday = todaysBookings.length > 0 || todaysItineraryDays.length > 0;

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Back + Actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          onClick={() => navigate('/trips')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Trips
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" className="gap-1.5"
            onClick={() => navigate(`/itineraries/new?tripId=${id}`)}>
            <Plus className="w-3.5 h-3.5" /> Itinerary
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Trip Hero Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-gray-400 tracking-wider">{trip.id}</span>
              <RecordNumberBadge label="Trip" n={trip.tripNumber} className="text-xs" />
              <Badge
                variant={
                  trip.status === 'confirmed'   ? 'success' :
                  trip.status === 'in_progress' ? 'default' :
                  trip.status === 'completed'   ? 'secondary' :
                  trip.status === 'cancelled'   ? 'destructive' :
                  'warning'
                }
              >
                {trip.status.replace(/_/g, ' ')}
              </Badge>
              {hasOpsToday && (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300 rounded-full px-2 py-0.5 animate-pulse">
                  ● OPS TODAY
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 font-display">{trip.customer}</h1>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-600">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                {trip.destination}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                {trip.pax} pax
              </span>
              {trip.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  {trip.phone}
                </span>
              )}
              {trip.email && (
                <GmailButton
                  email={trip.email}
                  onClick={() => gmail.toCustomer(trip.email!, trip.customer, trip.destination)}
                  label={trip.email}
                />
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                {trip.departure ? fmtDate(trip.departure) : 'Date TBD'}
                {trip.returnDate && ` → ${fmtDate(trip.returnDate)}`}
                {durationDays && (
                  <span className="text-gray-400 ml-1">({durationDays}N)</span>
                )}
                {trip.departure && (
                  <span className="text-blue-600 font-medium ml-1">{daysUntilLabel(trip.departure)}</span>
                )}
              </span>
            </div>
          </div>

          {/* Financial summary pill */}
          <div className="flex-shrink-0 text-right space-y-1">
            {trip.totalPayable === null ? (
              <div className="text-yellow-700 font-semibold text-sm bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                ⚠ Price Not Set
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold text-gray-900 font-display">
                  {formatCurrency(trip.totalPayable)}
                </div>
                <div className={cn('text-xs font-medium px-2.5 py-1 rounded-full inline-block', FINANCIAL_STATUS_CLASS[finStatus])}>
                  {FINANCIAL_STATUS_LABEL[finStatus]}
                </div>
                {trip.balanceDue > 0 && (
                  <div className="text-xs text-red-600 font-medium">
                    Balance: {formatCurrency(trip.balanceDue)}
                  </div>
                )}
                {trip.grossMargin > 0 && (
                  <div className="text-xs text-emerald-600 font-medium">
                    Margin: {trip.marginPct}%
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Status Stepper */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2 overflow-x-auto">
            {TRIP_STATUS_FLOW.map((s, idx) => {
              const isCurrent  = trip.status === s;
              const isPast     = TRIP_STATUS_FLOW.indexOf(trip.status as TripStatus) > idx;
              const isDisabled = s === 'confirmed' && !confirmCheck.ok;
              return (
                <div key={s} className="flex items-center gap-2 flex-shrink-0">
                  {idx > 0 && (
                    <div className={cn('h-px w-6', isPast || isCurrent ? 'bg-blue-400' : 'bg-gray-200')} />
                  )}
                  <button
                    disabled={isCurrent || isDisabled}
                    title={isDisabled ? confirmCheck.reason : undefined}
                    onClick={() => handleStatusChange(s)}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded-full font-medium transition-all',
                      isCurrent  ? 'bg-blue-600 text-white' :
                      isPast     ? 'bg-emerald-100 text-emerald-700' :
                      isDisabled ? 'bg-gray-100 text-gray-300 cursor-not-allowed' :
                      'bg-gray-100 text-gray-600 hover:bg-gray-200',
                    )}
                  >
                    {s.replace(/_/g, ' ')}
                  </button>
                </div>
              );
            })}
            {trip.status !== 'cancelled' && (
              <button
                onClick={() => handleStatusChange('cancelled')}
                className="ml-2 text-xs px-3 py-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 font-medium transition-all flex-shrink-0"
              >
                Cancel
              </button>
            )}
          </div>
          {!confirmCheck.ok && trip.status !== 'confirmed' && (
            <p className="mt-2 text-xs text-yellow-700">⚠ To confirm: {confirmCheck.reason}</p>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          COMMAND CENTER TABS
      ═══════════════════════════════════════════════════ */}
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-1.5">
            {hasOpsToday && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />}
            Overview
          </TabsTrigger>
          <TabsTrigger value="travel">
            Travel {bookings.length > 0 && `(${bookings.length})`}
          </TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="bookings">Bookings ({bookings.length})</TabsTrigger>
          <TabsTrigger value="vouchers">Vouchers ({vouchers.length})</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {/* ─────────────── OVERVIEW TAB ─────────────── */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Left column: main ops info */}
            <div className="lg:col-span-2 space-y-5">

              {/* Today's Operations — highlighted amber */}
              {hasOpsToday && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-bold text-amber-900">Today's Operations</h3>
                    <span className="text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                      {fmtDate(todayStr)}
                    </span>
                  </div>

                  {todaysBookings.map(b => {
                    const TypeIcon = TYPE_ICON[b.type] ?? Package;
                    const d = (b.detail ?? {}) as Record<string, unknown>;
                    return (
                      <div
                        key={b.id}
                        className="bg-white rounded-xl border border-amber-200 p-3 cursor-pointer hover:shadow-sm transition-all"
                        onClick={() => navigate(`/bookings/${b.id}`)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', TYPE_COLOR[b.type])}>
                              <TypeIcon className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-800 capitalize">{b.type} Booking</p>
                              <div className="flex flex-wrap gap-2 mt-0.5">
                                {Object.entries(d).slice(0, 4).filter(([, v]) => v && String(v).trim()).map(([k, v]) => (
                                  <span key={k} className="text-[11px] text-gray-500">
                                    <span className="font-medium text-gray-700 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}:</span>{' '}{String(v)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', STATUS_CONFIG[b.status]?.class ?? 'bg-gray-100 text-gray-600')}>
                              {STATUS_CONFIG[b.status]?.label ?? b.status}
                            </span>
                            <ChevronRight className="w-3 h-3 text-gray-400" />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {todaysItineraryDays.map(day => (
                    <div key={day.id} className="bg-white rounded-xl border border-amber-200 p-3">
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 text-xs font-bold">
                          D{day.dayNumber}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-800">{day.title}</p>
                          {day.activities.length > 0 && (
                            <p className="text-[11px] text-gray-500 mt-0.5">{day.activities.join(' · ')}</p>
                          )}
                          {(day.morning || day.afternoon || day.evening) && (
                            <div className="flex gap-3 mt-1 text-[11px] text-gray-500">
                              {day.morning   && <span><span className="font-medium">AM:</span> {day.morning}</span>}
                              {day.afternoon && <span><span className="font-medium">PM:</span> {day.afternoon}</span>}
                              {day.evening   && <span><span className="font-medium">Eve:</span> {day.evening}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Travel Overview */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600" /> Travel Overview
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <DetailField label="Destination"  value={trip.destination} />
                  <DetailField label="Travellers"   value={`${trip.pax} pax`} />
                  <DetailField label="Trip Type"    value={trip.type || '—'} />
                  <DetailField label="Departure"    value={trip.departure ? fmtDate(trip.departure) : '—'} />
                  <DetailField label="Return"       value={trip.returnDate ? fmtDate(trip.returnDate) : '—'} />
                  {durationDays && <DetailField label="Duration" value={`${durationDays} nights`} />}
                  {trip.departure && (
                    <DetailField label="Departs In"   value={daysUntilLabel(trip.departure)} />
                  )}
                  {trip.assignedTo && (
                    <DetailField label="Assigned To"  value={trip.assignedTo} />
                  )}
                </div>

                {/* Status grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {[
                    { label: 'Flight',   status: trip.flightStatus  },
                    { label: 'Hotel',    status: trip.hotelStatus   },
                    { label: 'Visa',     status: trip.visaStatus    },
                    { label: 'Check-in', status: trip.checkInStatus },
                  ].map(({ label, status }) => (
                    <div key={label} className={cn(
                      'rounded-lg p-2.5 text-center border',
                      status === 'done' || status === 'confirmed' || status === 'approved' || status === 'issued'
                        ? 'bg-emerald-50 border-emerald-200'
                        : status === 'booked'
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-gray-50 border-gray-200',
                    )}>
                      <p className="text-[10px] font-semibold text-gray-600">{label}</p>
                      <p className="text-xs font-bold capitalize mt-0.5">
                        {status?.replace(/_/g, ' ') ?? '—'}
                      </p>
                    </div>
                  ))}
                </div>

                {trip.notes && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-xs text-gray-600 leading-relaxed">{trip.notes}</p>
                  </div>
                )}
              </div>

              {/* Bookings at a Glance */}
              {bookings.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-600" /> Bookings at a Glance
                    </h3>
                    <button
                      onClick={() => navigate('/bookings/new')}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {TRAVEL_GROUPS.map(({ type, label, Icon }) => {
                      const count = bookings.filter(b => b.type === type).length;
                      if (!count) return null;
                      return (
                        <div key={type} className={cn('flex items-center gap-2.5 p-3 rounded-lg border', TYPE_COLOR[type])}>
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <div>
                            <p className="text-[10px] font-medium opacity-75">{label}</p>
                            <p className="text-sm font-bold">{count} booking{count > 1 ? 's' : ''}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right column: customer + finance snapshot */}
            <div className="space-y-5">

              {/* Customer Summary */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" /> Customer
                </h3>
                <div className="space-y-2.5">
                  <div>
                    <p className="text-base font-bold text-gray-900">{trip.customer}</p>
                    {customer?.companyName && (
                      <p className="text-xs text-gray-500">{customer.companyName}</p>
                    )}
                  </div>
                  {trip.phone && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <a href={`tel:${trip.phone}`} className="hover:text-blue-600 transition-colors">{trip.phone}</a>
                    </div>
                  )}
                  {trip.email && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Globe className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{trip.email}</span>
                    </div>
                  )}
                  {customer?.gstNumber && (
                    <div className="text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
                      <span className="text-gray-400">GST:</span>{' '}
                      <span className="font-mono text-gray-700">{customer.gstNumber}</span>
                    </div>
                  )}
                  {customer && (
                    <button
                      onClick={() => navigate(`/customers/${customer.id}`)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 transition-colors"
                    >
                      View Customer Profile <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Passport info if available */}
                {(customer?.passportNo || customer?.passportExpiry || customer?.passportCountry) && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
                        <Shield className="w-3 h-3" /> Passport
                      </p>
                      {customer.passportNo && (
                        <DetailField label="Passport No." value={customer.passportNo} />
                      )}
                      {customer.passportExpiry && (
                        <DetailField label="Expiry" value={fmtDate(customer.passportExpiry)} />
                      )}
                      {customer.passportCountry && (
                        <DetailField label="Country" value={customer.passportCountry} />
                      )}
                    </div>
                  </>
                )}

                {/* Additional passengers from bookings */}
                {passengerNames.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
                        <Users className="w-3 h-3" /> Passengers ({passengerNames.length})
                      </p>
                      <div className="space-y-1">
                        {passengerNames.map((name, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-gray-700">
                            <span className="w-4 h-4 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              {i + 1}
                            </span>
                            {name}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Finance Snapshot */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <IndianRupee className="w-4 h-4 text-emerald-600" /> Finance
                  </h3>
                  {trip.balanceDue > 0 && trip.email && (
                    <GmailButton
                      email={trip.email}
                      onClick={() => gmail.paymentReminder(trip.email!, trip.customer, trip.balanceDue, trip.id)}
                      label="Remind"
                      size="sm"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'Total Payable',   val: trip.totalPayable !== null ? formatCurrency(trip.totalPayable) : '⚠ Not Set', warn: trip.totalPayable === null },
                    { label: 'Received',        val: formatCurrency(trip.paidAmount),   green: true },
                    { label: 'Balance Due',     val: formatCurrency(trip.balanceDue),   red: trip.balanceDue > 0 },
                    null,
                    { label: 'Supplier Cost',   val: formatCurrency(trip.supplierCost) },
                    { label: 'Gross Margin',    val: `${formatCurrency(trip.grossMargin)} (${trip.marginPct}%)`, green: trip.grossMargin > 0 },
                  ].map((row, i) => {
                    if (!row) return <Separator key={i} className="my-1" />;
                    return (
                      <div key={row.label} className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">{row.label}</span>
                        <span className={cn('font-semibold',
                          row.warn  ? 'text-yellow-700' :
                          row.green ? 'text-emerald-600' :
                          row.red   ? 'text-red-600' :
                          'text-gray-800')}>
                          {row.val}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ─────────────── TRAVEL TAB ─────────────── */}
        <TabsContent value="travel">
          <div className="space-y-5">
            {bookings.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 text-center py-14">
                <FileText className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No bookings linked to this trip yet.</p>
                <Button
                  size="sm" variant="outline" className="mt-4 gap-1.5"
                  onClick={() => navigate('/bookings/new')}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Booking
                </Button>
              </div>
            ) : (
              TRAVEL_GROUPS.map(({ type, label, Icon }) => {
                const group = bookings.filter(b => b.type === type);
                if (group.length === 0) return null;
                const fields = DETAIL_FIELDS[type as keyof typeof DETAIL_FIELDS] ?? [];
                return (
                  <div key={type} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className={cn('flex items-center gap-3 px-5 py-3 border-b border-gray-100', TYPE_COLOR[type])}>
                      <Icon className="w-4 h-4" />
                      <h3 className="text-sm font-bold">{label}</h3>
                      <span className="text-xs opacity-70 ml-auto">{group.length} booking{group.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {group.map(b => {
                        const d = (b.detail ?? {}) as Record<string, unknown>;
                        const statusCfg = STATUS_CONFIG[b.status];
                        const primaryDate = getBookingPrimaryDate(b);
                        const daysLeft = daysUntil(primaryDate);

                        return (
                          <div
                            key={b.id}
                            className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => navigate(`/bookings/${b.id}`)}
                          >
                            <div className="flex items-start justify-between gap-4 mb-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-mono text-gray-400">{b.id}</span>
                                {statusCfg && (
                                  <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', statusCfg.class)}>
                                    {statusCfg.label}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {primaryDate && daysLeft !== null && (
                                  <span className={cn(
                                    'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                                    daysLeft === 0 ? 'bg-red-100 text-red-700' :
                                    daysLeft <= 3  ? 'bg-orange-100 text-orange-700' :
                                    daysLeft <= 7  ? 'bg-amber-100 text-amber-700' :
                                    'bg-gray-100 text-gray-500',
                                  )}>
                                    {daysLeft === 0 ? 'TODAY' : daysLeft < 0 ? 'Past' : `${daysLeft}d away`}
                                  </span>
                                )}
                                {b.totalPayable !== null && (
                                  <span className="text-sm font-bold text-gray-800">
                                    {formatCurrency(b.totalPayable)}
                                  </span>
                                )}
                                <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                              </div>
                            </div>

                            {/* Detail fields grid */}
                            {fields.length > 0 && (
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                {fields.map(field => {
                                  const val = d[field.key];
                                  if (!val || !String(val).trim()) return null;
                                  if (field.type === 'textarea') {
                                    return (
                                      <div key={field.key} className="col-span-2 space-y-0.5">
                                        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{field.label}</p>
                                        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{String(val)}</p>
                                      </div>
                                    );
                                  }
                                  return (
                                    <DetailField key={field.key} label={field.label} value={String(val)} />
                                  );
                                })}
                              </div>
                            )}

                            {b.notes && (
                              <div className="mt-3 pt-3 border-t border-gray-100">
                                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Notes</p>
                                <p className="text-xs text-gray-600 mt-0.5">{b.notes}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}

            {bookings.length > 0 && (
              <div className="flex justify-center">
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => navigate('/bookings/new')}>
                  <Plus className="w-3.5 h-3.5" /> Add Another Booking
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─────────────── FINANCE TAB ─────────────── */}
        <TabsContent value="finance">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Finance Summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <IndianRupee className="w-4 h-4 text-blue-600" /> Financial Summary
                </h3>
                {trip.balanceDue > 0 && trip.email && (
                  <GmailButton
                    email={trip.email}
                    onClick={() => gmail.paymentReminder(trip.email!, trip.customer, trip.balanceDue, trip.id)}
                    label="Send Reminder"
                    size="sm"
                  />
                )}
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Selling Price',   val: trip.totalAmount !== null ? formatCurrency(trip.totalAmount) : '⚠ Not Set', warn: trip.totalAmount === null },
                  ...(trip.gstRate > 0 ? [{ label: 'Taxable Amount', val: formatCurrency(trip.taxableAmount) }] : []),
                  { label: `GST (${trip.gstRate}%)`, val: formatCurrency(trip.gstAmount) },
                  { label: 'Total Payable',   val: trip.totalPayable !== null ? formatCurrency(trip.totalPayable) : '—' },
                  { label: 'Amount Received', val: formatCurrency(trip.paidAmount), green: true },
                  { label: 'Balance Due',     val: formatCurrency(trip.balanceDue), red: trip.balanceDue > 0 },
                  null,
                  { label: 'Supplier Cost',   val: formatCurrency(trip.supplierCost) },
                  { label: 'Gross Margin',    val: formatCurrency(trip.grossMargin), green: trip.grossMargin > 0 },
                  { label: 'Margin %',        val: `${trip.marginPct}%`, green: trip.marginPct > 0 },
                ].map((row, i) => {
                  if (!row) return <Separator key={i} className="my-1" />;
                  return (
                    <div key={row.label} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">{row.label}</span>
                      <span className={cn('font-semibold',
                        row.warn  ? 'text-yellow-700' :
                        row.green ? 'text-emerald-600' :
                        row.red   ? 'text-red-600' :
                        'text-gray-800')}>
                        {row.val}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Customer Payments */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> Customer Payments
                </h3>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                  onClick={() => { setEditPayment(null); setEditPayType('customer'); setPayFormOpen(true); }}>
                  <Plus className="w-3 h-3" /> Add Payment
                </Button>
              </div>

              {/* Quick record inline */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input
                    type="number" min={0} value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    placeholder="Quick amount"
                    className="w-full pl-6 h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <select
                  value={payMethod} onChange={e => setPayMethod(e.target.value)}
                  className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Credit Card'].map(m => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <Button onClick={handleRecordPayment} size="sm" className="gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Record
                </Button>
              </div>

              {payments.customer.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left pb-2 text-gray-500 font-semibold">Amount</th>
                        <th className="text-left pb-2 text-gray-500 font-semibold">Method</th>
                        <th className="text-left pb-2 text-gray-500 font-semibold">Date</th>
                        <th className="text-left pb-2 text-gray-500 font-semibold">Status</th>
                        <th className="text-left pb-2 text-gray-500 font-semibold">Ref</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {payments.customer.map(p => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="py-2 font-semibold text-emerald-600">{formatCurrency(p.amount)}</td>
                          <td className="py-2 text-gray-600 pr-3">{p.method}</td>
                          <td className="py-2 text-gray-500 pr-3">{fmtDate(p.date)}</td>
                          <td className="py-2 pr-3">
                            <span className={cn('px-1.5 py-0.5 rounded-full font-medium text-[10px]',
                              p.status === 'received' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700')}>
                              {p.status}
                            </span>
                          </td>
                          <td className="py-2 text-gray-400 pr-3">{p.reference || '—'}</td>
                          <td className="py-2">
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEditPayment(p, 'customer')}
                                className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button onClick={() => handleDeletePayment(p, 'customer')}
                                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                                <Trash2 className="w-3 h-3" />
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

            {/* Supplier Payments */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-orange-500" /> Supplier Payments
                </h3>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                  onClick={() => { setEditPayment(null); setEditPayType('supplier'); setPayFormOpen(true); }}>
                  <Plus className="w-3 h-3" /> Add Supplier
                </Button>
              </div>
              {payments.supplier.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No supplier payments recorded</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left pb-2 text-gray-500 font-semibold">Supplier</th>
                        <th className="text-left pb-2 text-gray-500 font-semibold">Amount</th>
                        <th className="text-left pb-2 text-gray-500 font-semibold">Method</th>
                        <th className="text-left pb-2 text-gray-500 font-semibold">Date</th>
                        <th className="text-left pb-2 text-gray-500 font-semibold">Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {payments.supplier.map(p => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="py-2 font-medium text-gray-700 pr-3">{p.customer || '—'}</td>
                          <td className="py-2 font-semibold text-red-500 pr-3">{formatCurrency(p.amount)}</td>
                          <td className="py-2 text-gray-600 pr-3">{p.method}</td>
                          <td className="py-2 text-gray-500 pr-3">{fmtDate(p.date)}</td>
                          <td className="py-2 pr-3">
                            <span className={cn('px-1.5 py-0.5 rounded-full font-medium text-[10px]',
                              p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700')}>
                              {p.status}
                            </span>
                          </td>
                          <td className="py-2">
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEditPayment(p, 'supplier')}
                                className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button onClick={() => handleDeletePayment(p, 'supplier')}
                                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                                <Trash2 className="w-3 h-3" />
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

            {/* Vendor Payments */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-violet-600" /> Vendor Payments
                </h3>
                <button
                  onClick={() => navigate(`/vendors`)}
                  className="text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1"
                >
                  Manage <ExternalLink className="w-3 h-3" />
                </button>
              </div>
              {vendorPayments.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No vendor payments linked to this trip</p>
              ) : (
                <div className="space-y-2">
                  {vendorPayments.map(vp => (
                    <div key={vp.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-semibold text-gray-800">{vp.vendorName}</p>
                          {vp.isPaid ? (
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5 font-medium">Paid</span>
                          ) : (
                            <span className="text-[10px] bg-yellow-100 text-yellow-700 rounded-full px-1.5 py-0.5 font-medium">Outstanding</span>
                          )}
                        </div>
                        {vp.description && (
                          <p className="text-[11px] text-gray-500 mt-0.5 truncate">{vp.description}</p>
                        )}
                        {vp.dueDate && !vp.isPaid && (
                          <p className="text-[11px] text-red-500 mt-0.5">Due: {fmtDate(vp.dueDate)}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-gray-800">{formatCurrency(vp.totalCost)}</p>
                        {vp.advancePaid > 0 && (
                          <p className="text-[11px] text-emerald-600">Paid: {formatCurrency(vp.advancePaid)}</p>
                        )}
                        {vp.outstanding > 0 && (
                          <p className="text-[11px] text-red-500">Pending: {formatCurrency(vp.outstanding)}</p>
                        )}
                        {!vp.isPaid && (
                          <button
                            onClick={async () => {
                              const ok = await confirm({
                                title: 'Mark as Paid?',
                                description: `Mark the ₹${vp.outstanding} outstanding balance for ${vp.vendorName} as paid?`,
                                confirmLabel: 'Mark Paid',
                              });
                              if (ok) {
                                markVendorPaid(vp.id, today());
                                toast.success('Vendor payment marked as paid');
                              }
                            }}
                            className="mt-1 text-[10px] text-violet-600 hover:text-violet-700 font-medium transition-colors"
                          >
                            Mark Paid
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                    <span className="text-gray-500">Total Vendor Cost</span>
                    <span className="font-bold text-gray-800">
                      {formatCurrency(vendorPayments.reduce((s, v) => s + v.totalCost, 0))}
                    </span>
                  </div>
                  {vendorPayments.some(v => !v.isPaid) && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Outstanding</span>
                      <span className="font-bold text-red-500">
                        {formatCurrency(vendorPayments.filter(v => !v.isPaid).reduce((s, v) => s + v.outstanding, 0))}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Receivables — read-only; use Receivables page to record receipts */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-indigo-600" /> Receivables
                </h3>
                <div className="flex items-center gap-2">
                  <Button size="sm" className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setRecEntryOpen(true)}>
                    <Plus className="w-3 h-3" /> Record Receipt
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                    onClick={() => setRecFormOpen(true)}>
                    <Plus className="w-3 h-3" /> New Invoice
                  </Button>
                </div>
              </div>
              {receivables.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No receivables linked to this trip</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left pb-2 text-gray-500 font-semibold">Invoice</th>
                        <th className="text-left pb-2 text-gray-500 font-semibold">Received</th>
                        <th className="text-left pb-2 text-gray-500 font-semibold">Balance / Advance</th>
                        <th className="text-left pb-2 text-gray-500 font-semibold">Due</th>
                        <th className="text-left pb-2 text-gray-500 font-semibold">Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {receivables.map(r => {
                        const fin = calcReceivableFinance({ invoiceAmount: r.invoiceAmount, entries: r.entries, dueDate: r.dueDate });
                        return (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="py-2 font-semibold text-gray-700 pr-3">{formatCurrency(r.invoiceAmount)}</td>
                            <td className="py-2 text-emerald-600 pr-3">{formatCurrency(fin.totalReceived)}</td>
                            <td className="py-2 pr-3">
                              {fin.balanceDue > 0 && <span className="text-red-500 font-semibold">{formatCurrency(fin.balanceDue)}</span>}
                              {fin.excessAmount > 0 && <span className="text-amber-600 font-semibold">+{formatCurrency(fin.excessAmount)} advance</span>}
                              {fin.balanceDue === 0 && fin.excessAmount === 0 && <span className="text-emerald-600">Settled</span>}
                            </td>
                            <td className="py-2 text-gray-500 pr-3">{r.dueDate ? fmtDate(r.dueDate) : '—'}</td>
                            <td className="py-2 pr-3">
                              <span className={cn('px-1.5 py-0.5 rounded-full font-medium text-[10px]', RECEIVABLE_STATUS_CLASS[fin.status])}>
                                {RECEIVABLE_STATUS_LABEL[fin.status]}
                              </span>
                            </td>
                            <td className="py-2">
                              <button
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: `Delete ${r.id}?`,
                                    description: 'This will permanently remove this receivable and its payment history.',
                                    confirmLabel: 'Delete', cancelLabel: 'Cancel', variant: 'destructive',
                                  });
                                  if (ok) { deleteReceivable(r.id); toast.success('Receivable deleted'); }
                                }}
                                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
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
          </div>
        </TabsContent>

        {/* ─────────────── BOOKINGS TAB ─────────────── */}
        <TabsContent value="bookings">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">{bookings.length} booking{bookings.length !== 1 ? 's' : ''} linked</p>
              <button
                onClick={() => navigate('/bookings/new')}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Booking
              </button>
            </div>
            {bookings.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 text-center py-10 text-gray-400 text-sm">
                No bookings linked to this trip yet.
                <br />
                <button onClick={() => navigate('/bookings')}
                  className="mt-3 text-blue-600 hover:text-blue-700 font-medium text-xs">
                  Go to Bookings →
                </button>
              </div>
            ) : (
              bookings.map(b => {
                const TypeIcon   = TYPE_ICON[b.type] ?? Package;
                const bkFinStat  = getFinancialStatus(b.totalPayable, b.advance);
                const detail     = (b.detail ?? {}) as Record<string, unknown>;
                const primaryDate = getBookingPrimaryDate(b);

                const SUMMARY_FIELDS: Record<string, string[]> = {
                  flight:   ['airline', 'pnr', 'origin', 'destination', 'departDate'],
                  hotel:    ['hotelName', 'city', 'checkIn', 'checkOut'],
                  cab:      ['pickup', 'drop', 'pickupDate'],
                  train:    ['trainName', 'pnr', 'fromStation', 'toStation', 'departure'],
                  visa:     ['country', 'visaType', 'passportNumber'],
                  activity: ['activityName', 'date', 'location'],
                };
                const fieldLabels: Record<string, string> = {
                  airline: 'Airline', pnr: 'PNR', origin: 'From', destination: 'To', departDate: 'Depart',
                  hotelName: 'Hotel', city: 'City', checkIn: 'Check-In', checkOut: 'Check-Out',
                  pickup: 'Pickup', drop: 'Drop', pickupDate: 'Date',
                  trainName: 'Train', fromStation: 'From', toStation: 'To', departure: 'Depart',
                  country: 'Country', visaType: 'Visa', passportNumber: 'Passport',
                  activityName: 'Activity', date: 'Date', location: 'Location',
                };
                const summaryPairs: Array<{ label: string; value: string }> = [];
                for (const key of (SUMMARY_FIELDS[b.type] ?? [])) {
                  const v = detail[key];
                  if (v && String(v).trim()) summaryPairs.push({ label: fieldLabels[key] ?? key, value: String(v) });
                  if (summaryPairs.length >= 3) break;
                }

                return (
                  <div key={b.id}
                    className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-sm hover:border-gray-300 transition-all"
                    onClick={() => navigate(`/bookings/${b.id}`)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5', TYPE_COLOR[b.type])}>
                          <TypeIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-800 capitalize">{b.type} Booking</p>
                            <span className="text-[10px] font-mono text-gray-400">{b.id}</span>
                            {primaryDate && (
                              <span className="text-[10px] text-gray-400">{fmtDate(primaryDate)}</span>
                            )}
                          </div>
                          {summaryPairs.length > 0 && (
                            <div className="flex flex-wrap gap-3 mt-1">
                              {summaryPairs.map(({ label, value }) => (
                                <span key={label} className="text-xs text-gray-500">
                                  <span className="font-medium text-gray-700">{label}:</span>{' '}{value}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 space-y-1">
                        <p className="text-sm font-bold text-gray-800">
                          {b.totalPayable !== null ? formatCurrency(b.totalPayable) : <span className="text-gray-300">—</span>}
                        </p>
                        <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-full', FINANCIAL_STATUS_CLASS[bkFinStat])}>
                          {FINANCIAL_STATUS_LABEL[bkFinStat]}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* ─────────────── VOUCHERS TAB ─────────────── */}
        <TabsContent value="vouchers">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-gray-800">Vouchers for this Trip</h3>
              <div className="flex items-center gap-2 flex-wrap">
                {VOUCHER_TYPES.map(t => (
                  <Button key={t.value} size="sm" variant="outline" className="gap-1.5 text-xs"
                    onClick={() => navigate(`/vouchers/new?tripId=${id}&type=${t.value}`)}>
                    <span>{t.emoji}</span> {t.label}
                  </Button>
                ))}
              </div>
            </div>
            {vouchers.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                <p>No vouchers yet for this trip.</p>
                <p className="text-xs mt-1">Generate hotel, transfer, activity or flight vouchers above.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Voucher #', 'Type', 'Vendor', 'Details', 'Status', ''].map(h => (
                        <th key={h} className="text-left font-semibold text-gray-500 px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {vouchers.map(v => {
                      const tm     = VOUCHER_TYPES.find(t => t.value === v.type);
                      const detail = v.type === 'hotel'    ? v.hotelName :
                                     v.type === 'transfer' ? `${v.pickupPoint} → ${v.dropPoint}` :
                                     v.type === 'activity' ? v.activityName :
                                     v.type === 'flight'   ? `${v.departure} → ${v.arrival} · ${v.pnr}` :
                                     v.type === 'visa'     ? v.country :
                                     v.notes;
                      return (
                        <tr key={v.id} className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => navigate(`/vouchers/${v.id}`)}>
                          <td className="px-3 py-2.5 font-mono text-indigo-600 font-semibold">{v.voucherNumber}</td>
                          <td className="px-3 py-2.5">{tm?.emoji} {tm?.label}</td>
                          <td className="px-3 py-2.5 text-gray-600">{v.vendorName || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-600 max-w-[180px] truncate">{detail || '—'}</td>
                          <td className="px-3 py-2.5">
                            <Badge variant={VOUCHER_STATUS_BADGE[v.status]}>{v.status}</Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <Button size="icon-sm" variant="ghost"
                              onClick={e => { e.stopPropagation(); navigate(`/vouchers/${v.id}`); }}>
                              <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Trip Documents */}
          {trip.documents && trip.documents.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4 mt-5">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" /> Trip Documents
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {trip.documents.map((doc, i) => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <FileText className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{doc.name || `Document ${i + 1}`}</p>
                      <p className="text-[11px] text-gray-400 capitalize">{doc.category}</p>
                    </div>
                    {doc.url && (
                      <a href={doc.url} target="_blank" rel="noreferrer"
                        className="text-blue-500 hover:text-blue-700 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─────────────── TIMELINE TAB ─────────────── */}
        <TabsContent value="timeline">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <ActivityTimeline
              activity={activityLog.filter(a => a.entityType === 'trip' && a.entityId === trip.id)}
              communications={communications.filter(c => c.entityType === 'trip' && c.entityId === trip.id)}
              emptyLabel="No activity recorded for this trip yet"
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Dialogs ─── */}
      <TripForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEdit}
        defaultValues={trip}
        title="Edit Trip"
      />

      <PaymentForm
        open={payFormOpen}
        onClose={() => { setPayFormOpen(false); setEditPayment(null); }}
        onSave={handleSavePayment}
        payment={editPayment}
        payType={editPayType}
      />

      <ReceivableForm
        open={recFormOpen}
        onClose={() => setRecFormOpen(false)}
        onSave={(data) => {
          createReceivable({
            ...data,
            customerId:   trip.customerId,
            customerName: data.customerName ?? trip.customer,
            tripId:       trip.id,
          });
          toast.success('Receivable added');
          setRecFormOpen(false);
        }}
        defaults={{ customerId: trip.customerId, customerName: trip.customer, tripId: trip.id }}
      />

      <RecordReceiptForm
        open={recEntryOpen}
        onClose={() => setRecEntryOpen(false)}
        defaultCustomerId={trip.customerId}
        defaultTripId={trip.id}
      />
    </div>
  );
}
