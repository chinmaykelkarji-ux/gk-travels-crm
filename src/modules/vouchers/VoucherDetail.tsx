import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Trash2, Copy, Send, CheckCircle, XCircle, Printer,
  MapPin, Phone, Mail, Calendar, Users, Building2, MessageCircle, IndianRupee,
} from 'lucide-react';
import { useStore, selectors } from '@/store';
import apiClient from '@/lib/apiClient';
import { fmtDate } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import { calcVoucherPricing } from '@/shared/utils/finance';
import { whatsapp, gmail } from '@/shared/utils/email';
import { cn } from '@/shared/utils/cn';
import { RecordNumberBadge } from '@/shared/components/RecordNumberBadge';
import type { VoucherStatus } from '@/shared/types';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { VOUCHER_TYPES, VOUCHER_STATUS_BADGE } from './Vouchers';
import { DocumentActionBar } from '@/shared/components/documents/DocumentActionBar';
import { voucherSummary } from '@/shared/components/documents/VoucherPrintView';

const MEAL_EMOJI: Record<string, string> = {
  'Room Only': '🛏', 'Bed & Breakfast': '🌅', 'Half Board': '☀️',
  'Full Board': '🍽', 'All Inclusive': '⭐',
};

export default function VoucherDetail() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();

  const voucher           = useStore(selectors.voucherById(id ?? ''));
  const deleteVoucher     = useStore(s => s.deleteVoucher);
  const setVoucherStatus  = useStore(s => s.setVoucherStatus);
  const duplicateVoucher  = useStore(s => s.duplicateVoucher);
  const logCommunication  = useStore(s => s.logCommunication);
  const linkedTrip        = useStore(s => voucher?.tripId ? s.trips.find(t => t.id === voucher.tripId) : undefined);
  const linkedCustomer    = useStore(s => voucher?.customerId ? s.customers.find(c => c.id === voucher.customerId) : undefined);
  const companySettings   = useStore(s => s.companySettings);

  const [deleting, setDeleting] = useState(false);

  function handleWhatsApp() {
    if (!voucher?.customerPhone) { toast.error('No phone number on this voucher'); return; }
    whatsapp.voucher({
      phone:       voucher.customerPhone,
      customerName: voucher.customerName,
      voucherNumber: voucher.voucherNumber,
      voucherType: typeMeta?.label ?? voucher.type,
      destination: voucher.destination,
    });
    logCommunication({
      type:       'whatsapp',
      recipient:  voucher.customerPhone,
      subject:    `Voucher ${voucher.voucherNumber}`,
      entityType: 'voucher',
      entityId:   voucher.id,
    });
  }

  function handleEmail() {
    if (!voucher) return;
    const email = linkedCustomer?.email ?? linkedTrip?.email ?? '';
    if (!email) { toast.error('No email address found — link this voucher to a customer or trip with an email'); return; }
    gmail.voucher({
      email,
      customerName:  voucher.customerName,
      voucherNumber: voucher.voucherNumber,
      voucherType:   typeMeta?.label ?? voucher.type,
      destination:   voucher.destination,
    });
    logCommunication({
      type:       'email',
      recipient:  email,
      subject:    `Voucher ${voucher.voucherNumber}`,
      entityType: 'voucher',
      entityId:   voucher.id,
    });
  }

  if (!voucher) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Voucher not found.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/vouchers')} className="mt-3">← Back to Vouchers</Button>
      </div>
    );
  }

  const typeMeta = VOUCHER_TYPES.find(t => t.value === voucher.type);
  const isDraft     = voucher.status === 'draft';
  const isIssued    = voucher.status === 'issued';
  const pricing     = calcVoucherPricing(voucher);

  async function handleDelete() {
    const ok = await confirm({
      title:        `Delete ${voucher!.voucherNumber}?`,
      description:  'This will permanently delete this voucher.',
      confirmLabel: 'Delete Voucher',
      variant:      'destructive',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/vouchers/${voucher!.id}`);
      deleteVoucher(voucher!.id);
      toast.success('Voucher deleted');
      navigate('/vouchers');
    } catch { toast.error('Failed to delete voucher'); }
    finally { setDeleting(false); }
  }

  function handleStatusChange(status: VoucherStatus) {
    setVoucherStatus(voucher!.id, status);
    toast.success(`Status → ${status}`);
  }

  function handleDuplicate() {
    const copy = duplicateVoucher(voucher!.id);
    if (copy) { toast.success('Voucher duplicated', copy.id); navigate(`/vouchers/${copy.id}`); }
  }

  return (
    <>
      {/* ── Screen view ─────────────────────────────────────── */}
      <div className="p-5 pb-20 space-y-5 animate-fade-in print:hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button onClick={() => navigate('/vouchers')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Vouchers
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            {voucher.customerPhone && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={handleWhatsApp}>
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </Button>
            )}
            {(linkedCustomer?.email || linkedTrip?.email) && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-[#EA4335] hover:bg-red-50" onClick={handleEmail}>
                <Mail className="w-3.5 h-3.5" /> Email
              </Button>
            )}
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => window.open(`/print/voucher/${voucher.id}`, '_blank')}>
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={handleDuplicate}>
              <Copy className="w-3.5 h-3.5" /> Duplicate
            </Button>
            {(isDraft || isIssued) && (
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => navigate(`/vouchers/${voucher.id}/edit`)}>
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </Button>
            )}
            {isDraft && (
              <Button size="sm" className="gap-1.5" onClick={() => handleStatusChange('issued')}>
                <Send className="w-3.5 h-3.5" /> Issue Voucher
              </Button>
            )}
            {isIssued && (
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleStatusChange('completed')}>
                <CheckCircle className="w-3.5 h-3.5" /> Mark Completed
              </Button>
            )}
            {!['cancelled', 'completed'].includes(voucher.status) && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-gray-500 hover:text-red-600"
                onClick={() => handleStatusChange('cancelled')}>
                <XCircle className="w-3.5 h-3.5" /> Cancel
              </Button>
            )}
            <Button variant="destructive" size="sm" loading={deleting} className="gap-1.5" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          </div>
        </div>

        {/* Hero card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className={cn('px-6 py-5 border-b border-gray-100',
            voucher.status === 'issued' ? 'bg-gradient-to-r from-indigo-50 to-blue-50' :
            voucher.status === 'completed' ? 'bg-gradient-to-r from-emerald-50 to-teal-50' :
            'bg-gradient-to-r from-slate-50 to-gray-50'
          )}>
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{typeMeta?.emoji}</span>
                  <span className="font-mono text-xs text-gray-400">{voucher.voucherNumber}</span>
                  <Badge variant={VOUCHER_STATUS_BADGE[voucher.status]}>{voucher.status.toUpperCase()}</Badge>
                  {linkedTrip && (
                    <button onClick={() => navigate(`/trips/${linkedTrip.id}`)}
                      className="text-xs font-mono text-blue-600 hover:underline">
                      {linkedTrip.id}
                      <RecordNumberBadge label="Trip" n={linkedTrip.tripNumber} className="ml-1 text-blue-300" />
                    </button>
                  )}
                </div>
                <h1 className="text-xl font-bold text-gray-900 font-display">
                  {typeMeta?.label} Voucher — {voucher.customerName}
                </h1>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                  {voucher.destination && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" />{voucher.destination}</span>}
                  {voucher.customerPhone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400" />{voucher.customerPhone}</span>}
                  <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-gray-400" />{voucher.pax} guest{voucher.pax !== 1 ? 's' : ''}</span>
                  {voucher.issueDate && <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-400" />Issued: {fmtDate(voucher.issueDate)}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Type details */}
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left column */}
            <div className="space-y-4">
              {/* Hotel */}
              {voucher.type === 'hotel' && (
                <div className="space-y-2">
                  {voucher.hotelName && <p className="text-base font-bold text-gray-900">{voucher.hotelName}</p>}
                  {voucher.hotelAddress && <p className="text-sm text-gray-600">{voucher.hotelAddress}</p>}
                  {voucher.hotelPhone && <p className="text-sm text-gray-600 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400" />{voucher.hotelPhone}</p>}
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    {voucher.checkIn  && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Check-in</p><p className="text-sm font-semibold">{fmtDate(voucher.checkIn)}</p></div>}
                    {voucher.checkOut && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Check-out</p><p className="text-sm font-semibold">{fmtDate(voucher.checkOut)}</p></div>}
                    {voucher.roomType && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Room Type</p><p className="text-sm">{voucher.roomType}</p></div>}
                    {voucher.mealPlan && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Meal Plan</p><p className="text-sm">{MEAL_EMOJI[voucher.mealPlan] ?? ''} {voucher.mealPlan}</p></div>}
                    {voucher.confirmationNo && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Confirmation</p><p className="text-sm font-mono font-bold text-indigo-600">{voucher.confirmationNo}</p></div>}
                  </div>
                </div>
              )}

              {/* Transfer */}
              {voucher.type === 'transfer' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 p-3 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] text-gray-400 uppercase tracking-wide">From</p><p className="text-sm font-semibold">{voucher.pickupPoint || '—'}</p></div>
                    <span className="text-gray-400">→</span>
                    <div className="flex-1 p-3 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] text-gray-400 uppercase tracking-wide">To</p><p className="text-sm font-semibold">{voucher.dropPoint || '—'}</p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {voucher.pickupDate && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Date</p><p className="text-sm">{fmtDate(voucher.pickupDate)}</p></div>}
                    {voucher.pickupTime && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Time</p><p className="text-sm font-bold">{voucher.pickupTime}</p></div>}
                    {voucher.vehicleType && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Vehicle</p><p className="text-sm">{voucher.vehicleType}</p></div>}
                    {voucher.flightInfo && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Flight</p><p className="text-sm font-mono">{voucher.flightInfo}</p></div>}
                  </div>
                  {(voucher.driverName || voucher.driverPhone) && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-2">
                      <p className="text-[10px] text-amber-600 font-semibold uppercase tracking-wide mb-1">Driver Details</p>
                      {voucher.driverName  && <p className="text-sm text-gray-800 font-semibold">{voucher.driverName}</p>}
                      {voucher.driverPhone && <p className="text-sm text-gray-600">{voucher.driverPhone}</p>}
                    </div>
                  )}
                </div>
              )}

              {/* Activity */}
              {voucher.type === 'activity' && (
                <div className="space-y-2">
                  {voucher.activityName && <p className="text-base font-bold text-gray-900">{voucher.activityName}</p>}
                  {voucher.activityVenue && <p className="text-sm text-gray-600 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" />{voucher.activityVenue}</p>}
                  <div className="grid grid-cols-2 gap-3">
                    {voucher.activityDate && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Date</p><p className="text-sm">{fmtDate(voucher.activityDate)}</p></div>}
                    {voucher.activityTime && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Time</p><p className="text-sm font-bold">{voucher.activityTime}</p></div>}
                  </div>
                  {voucher.activityNotes && <p className="text-sm text-gray-600 mt-2 p-3 bg-slate-50 rounded-xl">{voucher.activityNotes}</p>}
                </div>
              )}

              {/* Flight */}
              {voucher.type === 'flight' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-4">
                    <div className="text-center"><p className="text-2xl font-bold text-gray-900">{voucher.departure || '—'}</p><p className="text-xs text-gray-500">{voucher.departureDate ? fmtDate(voucher.departureDate) : ''}</p></div>
                    <div className="flex-1 text-center text-gray-400 text-2xl">→</div>
                    <div className="text-center"><p className="text-2xl font-bold text-gray-900">{voucher.arrival || '—'}</p><p className="text-xs text-gray-500">{voucher.arrivalDate ? fmtDate(voucher.arrivalDate) : ''}</p></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    {voucher.airline && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Airline</p><p className="text-sm font-semibold">{voucher.airline}</p></div>}
                    {voucher.flightNumber && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Flight</p><p className="text-sm font-mono font-bold">{voucher.flightNumber}</p></div>}
                    {voucher.pnr && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">PNR</p><p className="text-sm font-mono font-bold text-indigo-600">{voucher.pnr}</p></div>}
                    {voucher.flightClass && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Class</p><p className="text-sm">{voucher.flightClass}</p></div>}
                  </div>
                </div>
              )}

              {/* Bus */}
              {voucher.type === 'bus' && (
                <div className="space-y-2">
                  {voucher.operatorName && <p className="text-base font-bold text-gray-900">{voucher.operatorName}</p>}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 p-3 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] text-gray-400 uppercase tracking-wide">From</p><p className="text-sm font-semibold">{voucher.fromLocation || '—'}</p></div>
                    <span className="text-gray-400">→</span>
                    <div className="flex-1 p-3 bg-slate-50 rounded-xl border border-slate-100"><p className="text-[10px] text-gray-400 uppercase tracking-wide">To</p><p className="text-sm font-semibold">{voucher.toLocation || '—'}</p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {voucher.busType && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Bus Type</p><p className="text-sm">{voucher.busType}</p></div>}
                    {voucher.busNumber && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Bus Number</p><p className="text-sm font-mono">{voucher.busNumber}</p></div>}
                    {voucher.departure && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Departure</p><p className="text-sm font-bold">{voucher.departure}</p></div>}
                    {voucher.arrival && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Arrival</p><p className="text-sm font-bold">{voucher.arrival}</p></div>}
                    {voucher.duration && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Duration</p><p className="text-sm">{voucher.duration}</p></div>}
                    {voucher.pnr && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">PNR</p><p className="text-sm font-mono font-bold text-indigo-600">{voucher.pnr}</p></div>}
                    {voucher.seatNumbers && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Seats</p><p className="text-sm">{voucher.seatNumbers}</p></div>}
                    {voucher.reportingTime && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Reporting</p><p className="text-sm">{voucher.reportingTime}</p></div>}
                  </div>
                  {(voucher.boardingPoint || voucher.droppingPoint) && (
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      {voucher.boardingPoint && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Boarding Point</p><p className="text-sm">{voucher.boardingPoint}</p></div>}
                      {voucher.droppingPoint && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Dropping Point</p><p className="text-sm">{voucher.droppingPoint}</p></div>}
                    </div>
                  )}
                </div>
              )}

              {/* Visa */}
              {voucher.type === 'visa' && (
                <div className="grid grid-cols-2 gap-3">
                  {voucher.country   && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Country</p><p className="text-sm font-bold">{voucher.country}</p></div>}
                  {voucher.visaType  && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Type</p><p className="text-sm">{voucher.visaType}</p></div>}
                  {voucher.entryType && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Entry</p><p className="text-sm">{voucher.entryType}</p></div>}
                  {voucher.validity  && <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Validity</p><p className="text-sm">{voucher.validity}</p></div>}
                </div>
              )}

              {/* Guest names */}
              {voucher.guestNames && (
                <div className="mt-3"><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Guests</p><p className="text-sm text-gray-700">{voucher.guestNames}</p></div>
              )}
            </div>

            {/* Right column — vendor + notes */}
            <div className="space-y-4">
              {(voucher.vendorName || voucher.vendorPhone) && (
                <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-2 flex items-center gap-1.5"><Building2 className="w-3 h-3" />Vendor / Supplier</p>
                  {voucher.vendorName  && <p className="text-sm font-bold text-gray-900">{voucher.vendorName}</p>}
                  {voucher.vendorPhone && <p className="text-sm text-gray-600">{voucher.vendorPhone}</p>}
                  {voucher.vendorEmail && <p className="text-sm text-gray-600">{voucher.vendorEmail}</p>}
                </div>
              )}

              {/* Pricing — internal. Only the customer amount is ever printed. */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-2 flex items-center gap-1.5">
                  <IndianRupee className="w-3 h-3" />Pricing
                </p>
                {pricing.totalPayable === null ? (
                  <p className="text-sm text-gray-400">
                    Not priced yet.
                    {(isDraft || isIssued) && (
                      <button onClick={() => navigate(`/vouchers/${voucher.id}/edit`)}
                        className="ml-1.5 text-indigo-600 hover:underline">Add pricing</button>
                    )}
                  </p>
                ) : (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Cost (vendor)</span><span className="font-medium text-gray-900">{formatCurrency(pricing.costPrice)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Selling</span><span className="font-medium text-gray-900">{formatCurrency(pricing.sellingPrice)}</span>
                    </div>
                    {pricing.gstRate > 0 && (
                      <>
                        {pricing.gstMode === 'INCLUDED' && (
                          <div className="flex justify-between text-gray-600">
                            <span>Taxable</span><span className="font-medium text-gray-700">{formatCurrency(pricing.taxableAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-gray-600">
                          <span>GST ({pricing.gstRate}% {pricing.gstMode === 'INCLUDED' ? 'incl.' : 'extra'})</span>
                          <span className="font-medium text-amber-600">{formatCurrency(pricing.gstAmount)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between pt-1.5 border-t border-gray-100">
                      <span className="text-gray-600 font-medium">Total Payable</span>
                      <span className="font-bold text-indigo-700">{formatCurrency(pricing.totalPayable)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Gross Margin</span>
                      <span className={cn('font-bold', pricing.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                        {formatCurrency(pricing.grossProfit)} · {pricing.marginPct.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 pt-1">
                      {voucher.showPricing
                        ? 'Customer amount is printed on this voucher.'
                        : 'Pricing is hidden on the printed voucher.'}
                    </p>
                  </div>
                )}
              </div>

              {voucher.notes && (
                <div><p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Notes</p>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{voucher.notes}</p></div>
              )}

              {voucher.emergencyContact && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-[10px] text-red-600 font-semibold uppercase tracking-wide mb-1">🚨 Emergency</p>
                  <p className="text-sm text-red-800">{voucher.emergencyContact}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <DocumentActionBar
        onPrint={() => window.open(`/print/voucher/${voucher.id}`, '_blank')}
        whatsappMessage={`Dear ${voucher.customerName}, your ${typeMeta?.label ?? voucher.type} voucher ${voucher.voucherNumber} is confirmed. ${voucherSummary(voucher)}. Keep this voucher handy during travel. - GK Travels`}
        customerPhone={voucher.customerPhone ?? ''}
        customerEmail={linkedCustomer?.email ?? linkedTrip?.email}
        backLabel="Back to Vouchers"
        backHref="/vouchers"
        documentTitle={`Voucher ${voucher.voucherNumber}`}
      />
    </>
  );
}
