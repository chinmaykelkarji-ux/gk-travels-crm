import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Calendar, Users, Phone, IndianRupee,
  Edit2, Trash2, CheckCircle, Clock, Plane, Hotel, Globe, Plus,
} from 'lucide-react';
import { useStore, selectors } from '@/store';
import {
  FINANCIAL_STATUS_CLASS, FINANCIAL_STATUS_LABEL, getFinancialStatus,
} from '@/shared/utils/finance';
import { formatCurrency } from '@/shared/utils/format';
import { fmtDate, daysUntilLabel, today } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { canConfirmTrip } from '@/shared/schemas/trip';
import type { TripFormSchema } from '@/shared/schemas/trip';
import type { TripStatus, Payment } from '@/shared/types';
import { VOUCHER_TYPES, VOUCHER_STATUS_BADGE } from '@/modules/vouchers/Vouchers';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components/ui/tabs';
import { Separator } from '@/shared/components/ui/separator';
import { TripForm } from './TripForm';
import { PaymentForm } from '@/shared/components/PaymentForm';
import { GmailButton } from '@/shared/components/GmailButton';
import { gmail } from '@/shared/utils/email';

const TRIP_STATUS_FLOW: TripStatus[] = [
  'draft', 'quotation', 'confirmed', 'in_progress', 'completed',
];

export default function TripDetail() {
  const { id }  = useParams<{ id: string }>();
  const navigate = useNavigate();

  const trip         = useStore(selectors.tripById(id ?? ''));
  const updateTrip   = useStore(s => s.updateTrip);
  const deleteTrip   = useStore(s => s.deleteTrip);
  const setTripStatus = useStore(s => s.setTripStatus);
  const payments     = useStore(selectors.paymentsForTrip(id ?? ''));
  const bookings     = useStore(selectors.bookingsForTrip(id ?? ''));
  const vouchers     = useStore(selectors.vouchersForTrip(id ?? ''));
  const recordPayment = useStore(s => s.recordPayment);

  const updatePayment = useStore(s => s.updatePayment);
  const deletePayment = useStore(s => s.deletePayment);

  const [editOpen, setEditOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');

  // Payment edit dialog state
  const [payFormOpen, setPayFormOpen]   = useState(false);
  const [editPayment, setEditPayment]   = useState<Payment | null>(null);
  const [editPayType, setEditPayType]   = useState<'customer' | 'supplier'>('customer');

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
      type:      'customer',
      tripId:    id,
      customer:  trip!.customer,
      amount,
      method:    payMethod,
      date:      today(),
      status:    'received',
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
              {!trip.email && trip.balanceDue > 0 && (
                <span className="text-xs text-gray-400 italic">no email on file</span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                {trip.departure ? fmtDate(trip.departure) : 'Date TBD'}
                {trip.returnDate && ` → ${fmtDate(trip.returnDate)}`}
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
                      'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
            <p className="mt-2 text-xs text-yellow-700">
              ⚠ To confirm: {confirmCheck.reason}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="finance">
        <TabsList>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="bookings">Bookings ({bookings.length})</TabsTrigger>
          <TabsTrigger value="vouchers">Vouchers ({vouchers.length})</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {/* Finance Tab */}
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
                  { label: 'Selling Price',   val: trip.totalAmount  !== null ? formatCurrency(trip.totalAmount)  : '⚠ Not Set', warn: trip.totalAmount === null },
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
                      <span className={cn(
                        'font-semibold',
                        row.warn  ? 'text-yellow-700' :
                        row.green ? 'text-emerald-600' :
                        row.red   ? 'text-red-600' :
                        'text-gray-800'
                      )}>
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
                <Button
                  size="sm" variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => { setEditPayment(null); setEditPayType('customer'); setPayFormOpen(true); }}
                >
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
                              <button
                                onClick={() => openEditPayment(p, 'customer')}
                                className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleDeletePayment(p, 'customer')}
                                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                title="Delete"
                              >
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
                <h3 className="text-sm font-semibold text-gray-800">Supplier Payments</h3>
                <Button
                  size="sm" variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => { setEditPayment(null); setEditPayType('supplier'); setPayFormOpen(true); }}
                >
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
                              <button
                                onClick={() => openEditPayment(p, 'supplier')}
                                className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleDeletePayment(p, 'supplier')}
                                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                title="Delete"
                              >
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
          </div>
        </TabsContent>

        {/* Operations Tab */}
        <TabsContent value="operations">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Flight',   icon: Plane,  status: trip.flightStatus,  key: 'flightStatus'  },
                { label: 'Hotel',    icon: Hotel,  status: trip.hotelStatus,   key: 'hotelStatus'   },
                { label: 'Visa',     icon: Globe,  status: trip.visaStatus,    key: 'visaStatus'    },
                { label: 'Check-in', icon: CheckCircle, status: trip.checkInStatus, key: 'checkInStatus' },
              ].map(({ label, icon: Icon, status, key }) => (
                <div
                  key={key}
                  className={cn(
                    'rounded-xl p-4 border text-center',
                    status === 'done' || status === 'confirmed' || status === 'approved' || status === 'issued'
                      ? 'bg-emerald-50 border-emerald-200'
                      : status === 'booked'
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-gray-50 border-gray-200'
                  )}
                >
                  <Icon className="w-5 h-5 mx-auto mb-2 text-gray-400" />
                  <p className="text-xs font-semibold text-gray-700">{label}</p>
                  <p className="text-xs text-gray-500 capitalize mt-0.5">{status?.replace(/_/g, ' ') ?? '—'}</p>
                </div>
              ))}
            </div>
            {trip.notes && (
              <div className="mt-5 p-4 bg-gray-50 rounded-xl">
                <p className="text-xs font-medium text-gray-600 mb-1">Notes</p>
                <p className="text-sm text-gray-700 leading-relaxed">{trip.notes}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Bookings Tab */}
        <TabsContent value="bookings">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            {bookings.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                No bookings linked to this trip yet.
                <br />
                <button
                  onClick={() => navigate('/bookings')}
                  className="mt-3 text-blue-600 hover:text-blue-700 font-medium text-xs"
                >
                  Go to Bookings →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {bookings.map(b => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-800 capitalize">{b.type} booking</p>
                      <p className="text-xs text-gray-400 mt-0.5">{b.id} · {b.customerName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-800">
                        {b.totalPayable !== null ? formatCurrency(b.totalPayable) : '—'}
                      </p>
                      <span className={cn('text-[11px] font-medium', FINANCIAL_STATUS_CLASS[
                        getFinancialStatus(b.totalPayable, b.advance)
                      ])}>
                        {FINANCIAL_STATUS_LABEL[getFinancialStatus(b.totalPayable, b.advance)]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Vouchers Tab */}
        <TabsContent value="vouchers">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
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
                      const tm = VOUCHER_TYPES.find(t => t.value === v.type);
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
                              <Plus className="w-3.5 h-3.5 rotate-45 text-gray-400" />
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
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            {(!trip.timeline || trip.timeline.length === 0) ? (
              <p className="text-sm text-gray-400 text-center py-8">No timeline events yet</p>
            ) : (
              <div className="space-y-3">
                {[...trip.timeline].reverse().map((event, i) => (
                  <div key={event.id || i} className="flex items-start gap-3">
                    <div className={cn(
                      'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                      event.type === 'payment' ? 'bg-emerald-400' :
                      event.type === 'warning' ? 'bg-yellow-400' :
                      event.type === 'done'    ? 'bg-blue-400'   :
                      'bg-gray-300'
                    )} />
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">{event.event}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(event.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Trip Form */}
      <TripForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEdit}
        defaultValues={trip}
        title="Edit Trip"
      />

      {/* Payment Add / Edit Form */}
      <PaymentForm
        open={payFormOpen}
        onClose={() => { setPayFormOpen(false); setEditPayment(null); }}
        onSave={handleSavePayment}
        payment={editPayment}
        payType={editPayType}
      />
    </div>
  );
}
