import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { useStore, selectors } from '@/store';
import apiClient from '@/lib/apiClient';
import type { Voucher, VoucherType } from '@/shared/types';
import { today } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { toast } from '@/shared/hooks/useToast';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { VOUCHER_TYPES } from './Vouchers';

// ─── Helpers ─────────────────────────────────────────────────

interface FieldProps {
  label: string;
  id: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, id, required, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} required={required}>{label}</Label>
      {children}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────

export default function VoucherForm() {
  const navigate      = useNavigate();
  const [params]      = useSearchParams();
  const { id: routeId } = useParams<{ id?: string }>();

  // Load existing voucher when on the /edit route
  const existingFromStore = useStore(selectors.voucherById(routeId ?? ''));
  const existing = routeId ? existingFromStore : undefined;

  const tripIdParam   = params.get('tripId') ?? '';
  const typeParam     = (params.get('type') as VoucherType) ?? 'hotel';

  const vendors       = useStore(s => s.vendors);
  const trips         = useStore(s => s.trips);
  const customers     = useStore(s => s.customers);
  const createVoucher = useStore(s => s.createVoucher);
  const updateVoucher = useStore(s => s.updateVoucher);

  // ── State ─────────────────────────────────────────────────

  const [type,          setType]          = useState<VoucherType>(existing?.type ?? typeParam);
  const [tripId,        setTripId]        = useState(existing?.tripId  ?? tripIdParam);
  const [vendorId,      setVendorId]      = useState(existing?.vendorId ?? '');
  const [customerName,  setCustomerName]  = useState(existing?.customerName  ?? '');
  const [customerPhone, setCustomerPhone] = useState(existing?.customerPhone ?? '');
  const [guestNames,    setGuestNames]    = useState(existing?.guestNames ?? '');
  const [destination,   setDestination]   = useState(existing?.destination ?? '');
  const [pax,           setPax]           = useState(existing?.pax ?? 1);
  const [notes,         setNotes]         = useState(existing?.notes ?? '');
  const [emergencyContact, setEmergencyContact] = useState(existing?.emergencyContact ?? '');

  // Hotel
  const [hotelName,      setHotelName]      = useState(existing?.hotelName      ?? '');
  const [hotelAddress,   setHotelAddress]   = useState(existing?.hotelAddress   ?? '');
  const [hotelPhone,     setHotelPhone]     = useState(existing?.hotelPhone     ?? '');
  const [checkIn,        setCheckIn]        = useState(existing?.checkIn        ?? '');
  const [checkOut,       setCheckOut]       = useState(existing?.checkOut       ?? '');
  const [roomType,       setRoomType]       = useState(existing?.roomType       ?? '');
  const [mealPlan,       setMealPlan]       = useState(existing?.mealPlan       ?? '');
  const [confirmationNo, setConfirmationNo] = useState(existing?.confirmationNo ?? '');

  // Transfer
  const [pickupPoint,  setPickupPoint]  = useState(existing?.pickupPoint  ?? '');
  const [dropPoint,    setDropPoint]    = useState(existing?.dropPoint    ?? '');
  const [pickupDate,   setPickupDate]   = useState(existing?.pickupDate   ?? '');
  const [pickupTime,   setPickupTime]   = useState(existing?.pickupTime   ?? '');
  const [vehicleType,  setVehicleType]  = useState(existing?.vehicleType  ?? '');
  const [driverName,   setDriverName]   = useState(existing?.driverName   ?? '');
  const [driverPhone,  setDriverPhone]  = useState(existing?.driverPhone  ?? '');
  const [flightInfo,   setFlightInfo]   = useState(existing?.flightInfo   ?? '');

  // Activity
  const [activityName,  setActivityName]  = useState(existing?.activityName  ?? '');
  const [activityDate,  setActivityDate]  = useState(existing?.activityDate  ?? '');
  const [activityTime,  setActivityTime]  = useState(existing?.activityTime  ?? '');
  const [activityVenue, setActivityVenue] = useState(existing?.activityVenue ?? '');
  const [activityNotes, setActivityNotes] = useState(existing?.activityNotes ?? '');

  // Flight
  const [airline,       setAirline]       = useState(existing?.airline       ?? '');
  const [flightNumber,  setFlightNumber]  = useState(existing?.flightNumber  ?? '');
  const [pnr,           setPnr]           = useState(existing?.pnr           ?? '');
  const [departure,     setDeparture]     = useState(existing?.departure     ?? '');
  const [arrival,       setArrival]       = useState(existing?.arrival       ?? '');
  const [departureDate, setDepartureDate] = useState(existing?.departureDate ?? '');
  const [arrivalDate,   setArrivalDate]   = useState(existing?.arrivalDate   ?? '');
  const [flightClass,   setFlightClass]   = useState(existing?.flightClass   ?? '');

  // Visa
  const [visaType,    setVisaType]    = useState(existing?.visaType    ?? '');
  const [country,     setCountry]     = useState(existing?.country     ?? '');
  const [entryType,   setEntryType]   = useState(existing?.entryType   ?? '');
  const [validity,    setValidity]    = useState(existing?.validity     ?? '');

  // Vendor (denormalized)
  const [vendorName,  setVendorName]  = useState(existing?.vendorName  ?? '');
  const [vendorPhone, setVendorPhone] = useState(existing?.vendorPhone ?? '');
  const [vendorEmail, setVendorEmail] = useState(existing?.vendorEmail ?? '');

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // ── Auto-fill from trip ───────────────────────────────────

  useEffect(() => {
    if (!tripIdParam || existing) return;
    apiClient.get(`/vouchers/from-trip/${tripIdParam}`)
      .then(r => {
        const d = r.data;
        setTripId(d.tripId ?? tripIdParam);
        if (!customerName) setCustomerName(d.customerName ?? '');
        if (!customerPhone) setCustomerPhone(d.customerPhone ?? '');
        if (!destination) setDestination(d.destination ?? '');
        if (!pax || pax === 1) setPax(d.pax ?? 1);
        if (!checkIn)        setCheckIn(d.checkIn        ?? '');
        if (!checkOut)       setCheckOut(d.checkOut      ?? '');
        if (!pickupDate)     setPickupDate(d.pickupDate  ?? '');
        if (!departureDate)  setDepartureDate(d.departureDate ?? '');
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-fill vendor ─────────────────────────────────────

  function handleVendorChange(vid: string) {
    setVendorId(vid);
    const v = vendors.find(v => v.id === vid);
    if (!v) return;
    setVendorName(v.name);
    setVendorPhone(v.phone ?? '');
    setVendorEmail(v.email ?? '');
    if (type === 'hotel' && !hotelName) setHotelName(v.name);
    if (type === 'hotel' && !hotelPhone) setHotelPhone(v.phone ?? '');
  }

  // ── Build payload ─────────────────────────────────────────

  function buildPayload(): Partial<Voucher> {
    return {
      type, tripId: tripId || undefined,
      vendorId: vendorId || undefined,
      customerName, customerPhone: customerPhone || undefined,
      guestNames: guestNames || undefined,
      destination: destination || undefined, pax,
      notes: notes || undefined,
      emergencyContact: emergencyContact || undefined,
      vendorName: vendorName || undefined,
      vendorPhone: vendorPhone || undefined,
      vendorEmail: vendorEmail || undefined,
      // Hotel
      hotelName: hotelName || undefined, hotelAddress: hotelAddress || undefined,
      hotelPhone: hotelPhone || undefined,
      checkIn: checkIn || undefined, checkOut: checkOut || undefined,
      roomType: roomType || undefined, mealPlan: mealPlan || undefined,
      confirmationNo: confirmationNo || undefined,
      // Transfer
      pickupPoint: pickupPoint || undefined, dropPoint: dropPoint || undefined,
      pickupDate: pickupDate || undefined, pickupTime: pickupTime || undefined,
      vehicleType: vehicleType || undefined, driverName: driverName || undefined,
      driverPhone: driverPhone || undefined, flightInfo: flightInfo || undefined,
      // Activity
      activityName: activityName || undefined, activityDate: activityDate || undefined,
      activityTime: activityTime || undefined, activityVenue: activityVenue || undefined,
      activityNotes: activityNotes || undefined,
      // Flight
      airline: airline || undefined, flightNumber: flightNumber || undefined,
      pnr: pnr || undefined, departure: departure || undefined,
      arrival: arrival || undefined, departureDate: departureDate || undefined,
      arrivalDate: arrivalDate || undefined, flightClass: flightClass || undefined,
      // Visa
      visaType: visaType || undefined, country: country || undefined,
      entryType: entryType || undefined, validity: validity || undefined,
      createdDate: existing?.createdDate ?? today(),
    };
  }

  // ── Save ─────────────────────────────────────────────────

  async function handleSave() {
    setError('');
    if (!customerName.trim()) { setError('Customer name is required'); return; }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (existing) {
        updateVoucher(existing.id, payload);
        toast.success('Voucher updated');
        navigate(`/vouchers/${existing.id}`);
      } else {
        const v = createVoucher(payload);
        toast.success('Voucher created', v.id);
        navigate(`/vouchers/${v.id}`);
      }
    } catch {
      toast.error('Failed to save voucher');
    } finally {
      setSaving(false);
    }
  }

  // ── Shared vendor section ─────────────────────────────────

  const vendorSection = (
    <div className="space-y-3 pt-4 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendor / Supplier</p>
      <Field label="Select Vendor" id="vf-vendor">
        <select value={vendorId} onChange={e => handleVendorChange(e.target.value)}
          className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30">
          <option value="">— None —</option>
          {vendors.filter(v => v.isActive).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Vendor Name" id="vf-vname">
          <Input id="vf-vname" value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="Name" />
        </Field>
        <Field label="Vendor Phone" id="vf-vphone">
          <Input id="vf-vphone" value={vendorPhone} onChange={e => setVendorPhone(e.target.value)} placeholder="Phone" />
        </Field>
        <Field label="Vendor Email" id="vf-vemail">
          <Input id="vf-vemail" type="email" value={vendorEmail} onChange={e => setVendorEmail(e.target.value)} placeholder="Email" />
        </Field>
      </div>
    </div>
  );

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button onClick={() => navigate(existing ? `/vouchers/${existing.id}` : '/vouchers')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {existing ? 'Back to Voucher' : 'Back to Vouchers'}
        </button>
        <Button size="sm" loading={saving} className="gap-1.5" onClick={handleSave}>
          <Save className="w-3.5 h-3.5" /> {existing ? 'Save Changes' : 'Create Voucher'}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Left: main fields */}
        <div className="xl:col-span-2 space-y-5">

          {/* Voucher type */}
          {!existing && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Voucher Type</h3>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {VOUCHER_TYPES.map(t => (
                  <button key={t.value} onClick={() => setType(t.value)}
                    className={cn('flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-xs font-medium transition-all',
                      type === t.value
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    )}>
                    <span className="text-lg">{t.emoji}</span>{t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Customer & trip */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Customer Details</h3>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Customer Name" id="vf-cname" required>
                <div className="relative">
                  <Input id="vf-cname" list="cust-list" value={customerName}
                    onChange={e => {
                      setCustomerName(e.target.value);
                      const c = customers.find(c => c.name === e.target.value);
                      if (c && !customerPhone) setCustomerPhone(c.phone ?? '');
                    }} placeholder="Full name" />
                  <datalist id="cust-list">{customers.map(c => <option key={c.id} value={c.name} />)}</datalist>
                </div>
              </Field>
              <Field label="Phone" id="vf-cphone">
                <Input id="vf-cphone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Guest Names" id="vf-guests">
                <Input id="vf-guests" value={guestNames} onChange={e => setGuestNames(e.target.value)} placeholder="Mr. A, Mrs. B, …" />
              </Field>
              <Field label="No. of Guests" id="vf-pax">
                <Input id="vf-pax" type="number" min={1} value={pax} onChange={e => setPax(Number(e.target.value))} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Destination" id="vf-dest">
                <Input id="vf-dest" value={destination} onChange={e => setDestination(e.target.value)} placeholder="Dubai, Bali…" />
              </Field>
              <Field label="Link to Trip" id="vf-trip">
                <select value={tripId} onChange={e => setTripId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30">
                  <option value="">— No Trip —</option>
                  {trips.filter(t => !['cancelled', 'completed'].includes(t.status)).map(t => (
                    <option key={t.id} value={t.id}>{t.id} · {t.customer} → {t.destination}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {/* Type-specific fields */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <span>{VOUCHER_TYPES.find(t => t.value === type)?.emoji}</span>
              {VOUCHER_TYPES.find(t => t.value === type)?.label} Details
            </h3>

            {type === 'hotel' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Hotel Name" id="vf-hname" required><Input id="vf-hname" value={hotelName} onChange={e => setHotelName(e.target.value)} placeholder="Hotel name" /></Field>
                  <Field label="Confirmation No." id="vf-conf"><Input id="vf-conf" value={confirmationNo} onChange={e => setConfirmationNo(e.target.value)} placeholder="Booking reference" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Check-in" id="vf-ci"><Input id="vf-ci" type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} /></Field>
                  <Field label="Check-out" id="vf-co"><Input id="vf-co" type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Room Type" id="vf-room"><Input id="vf-room" value={roomType} onChange={e => setRoomType(e.target.value)} placeholder="Deluxe, Suite…" /></Field>
                  <Field label="Meal Plan" id="vf-meal">
                    <select value={mealPlan} onChange={e => setMealPlan(e.target.value)}
                      className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30">
                      <option value="">— Select —</option>
                      {['Room Only', 'Bed & Breakfast', 'Half Board', 'Full Board', 'All Inclusive'].map(m => <option key={m}>{m}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Hotel Address" id="vf-haddr"><Input id="vf-haddr" value={hotelAddress} onChange={e => setHotelAddress(e.target.value)} placeholder="Full address" /></Field>
                  <Field label="Hotel Phone" id="vf-hphone"><Input id="vf-hphone" value={hotelPhone} onChange={e => setHotelPhone(e.target.value)} placeholder="Front desk" /></Field>
                </div>
                {vendorSection}
              </div>
            )}

            {type === 'transfer' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Pickup Point" id="vf-pu" required><Input id="vf-pu" value={pickupPoint} onChange={e => setPickupPoint(e.target.value)} placeholder="Hotel / Airport / Address" /></Field>
                  <Field label="Drop Point" id="vf-dp" required><Input id="vf-dp" value={dropPoint} onChange={e => setDropPoint(e.target.value)} placeholder="Hotel / Airport / Address" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Pickup Date" id="vf-pd"><Input id="vf-pd" type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)} /></Field>
                  <Field label="Pickup Time" id="vf-pt"><Input id="vf-pt" type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Vehicle Type" id="vf-veh"><Input id="vf-veh" value={vehicleType} onChange={e => setVehicleType(e.target.value)} placeholder="Sedan, SUV, Van…" /></Field>
                  <Field label="Driver Name" id="vf-drv"><Input id="vf-drv" value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Driver name" /></Field>
                  <Field label="Driver Phone" id="vf-drvp"><Input id="vf-drvp" value={driverPhone} onChange={e => setDriverPhone(e.target.value)} placeholder="Mobile" /></Field>
                </div>
                <Field label="Flight Info (if airport transfer)" id="vf-fl"><Input id="vf-fl" value={flightInfo} onChange={e => setFlightInfo(e.target.value)} placeholder="EK507 / 14:30" /></Field>
                {vendorSection}
              </div>
            )}

            {type === 'activity' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Activity Name" id="vf-act" required><Input id="vf-act" value={activityName} onChange={e => setActivityName(e.target.value)} placeholder="Desert Safari, Museum…" /></Field>
                  <Field label="Venue / Location" id="vf-venue"><Input id="vf-venue" value={activityVenue} onChange={e => setActivityVenue(e.target.value)} placeholder="Meeting point" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date" id="vf-adate"><Input id="vf-adate" type="date" value={activityDate} onChange={e => setActivityDate(e.target.value)} /></Field>
                  <Field label="Time" id="vf-atime"><Input id="vf-atime" type="time" value={activityTime} onChange={e => setActivityTime(e.target.value)} /></Field>
                </div>
                <Field label="Activity Notes" id="vf-anotes">
                  <textarea id="vf-anotes" rows={2} value={activityNotes} onChange={e => setActivityNotes(e.target.value)}
                    placeholder="Dress code, inclusions, meeting instructions…"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 resize-none" />
                </Field>
                {vendorSection}
              </div>
            )}

            {type === 'flight' && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Airline" id="vf-airl" required><Input id="vf-airl" value={airline} onChange={e => setAirline(e.target.value)} placeholder="Emirates, IndiGo…" /></Field>
                  <Field label="Flight No." id="vf-fno"><Input id="vf-fno" value={flightNumber} onChange={e => setFlightNumber(e.target.value)} placeholder="EK507" /></Field>
                  <Field label="PNR" id="vf-pnr"><Input id="vf-pnr" value={pnr} onChange={e => setPnr(e.target.value)} placeholder="ABCDEF" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="From" id="vf-dep"><Input id="vf-dep" value={departure} onChange={e => setDeparture(e.target.value)} placeholder="BOM" /></Field>
                  <Field label="To" id="vf-arr"><Input id="vf-arr" value={arrival} onChange={e => setArrival(e.target.value)} placeholder="DXB" /></Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Departure Date" id="vf-ddate"><Input id="vf-ddate" type="date" value={departureDate} onChange={e => setDepartureDate(e.target.value)} /></Field>
                  <Field label="Arrival Date" id="vf-adate"><Input id="vf-adate" type="date" value={arrivalDate} onChange={e => setArrivalDate(e.target.value)} /></Field>
                  <Field label="Class" id="vf-cls">
                    <select value={flightClass} onChange={e => setFlightClass(e.target.value)}
                      className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30">
                      <option value="">— Select —</option>
                      {['Economy', 'Premium Economy', 'Business', 'First'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            )}

            {type === 'visa' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Country" id="vf-ctry" required><Input id="vf-ctry" value={country} onChange={e => setCountry(e.target.value)} placeholder="UAE, UK, USA…" /></Field>
                  <Field label="Visa Type" id="vf-vtype"><Input id="vf-vtype" value={visaType} onChange={e => setVisaType(e.target.value)} placeholder="Tourist, Business…" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Entry Type" id="vf-entry">
                    <select value={entryType} onChange={e => setEntryType(e.target.value)}
                      className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30">
                      <option value="">— Select —</option>
                      <option>Single Entry</option><option>Multiple Entry</option>
                    </select>
                  </Field>
                  <Field label="Validity" id="vf-val"><Input id="vf-val" value={validity} onChange={e => setValidity(e.target.value)} placeholder="30 days / 6 months" /></Field>
                </div>
                {vendorSection}
              </div>
            )}

            {type === 'general' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Use the Notes field below to describe the service or voucher details.</p>
                {vendorSection}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Notes & Emergency</h3>
            <Field label="Guest-facing Notes" id="vf-notes">
              <textarea id="vf-notes" rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Dress code, special instructions, what to carry…"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 resize-none" />
            </Field>
            <Field label="Emergency Contact" id="vf-emg">
              <Input id="vf-emg" value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)}
                placeholder="GK Travels: +91 XXXXX XXXXX" />
            </Field>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 sticky top-5">
            <h3 className="text-sm font-semibold text-gray-800">Summary</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Type</span>
                <span className="font-medium">{VOUCHER_TYPES.find(t => t.value === type)?.emoji} {VOUCHER_TYPES.find(t => t.value === type)?.label}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Customer</span><span className="font-medium text-gray-900">{customerName || '—'}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Destination</span><span className="font-medium text-gray-900">{destination || '—'}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Pax</span><span className="font-medium text-gray-900">{pax}</span>
              </div>
              {vendorName && (
                <div className="flex justify-between text-gray-600">
                  <span>Vendor</span><span className="font-medium text-gray-900">{vendorName}</span>
                </div>
              )}
            </div>
            <Button className="w-full mt-3 gap-1.5" loading={saving} onClick={handleSave}>
              <Save className="w-3.5 h-3.5" /> {existing ? 'Save Changes' : 'Create Voucher'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
