import {
  Plane, Hotel, Car, Train, Bus, Shield, Activity, Package,
} from 'lucide-react';
import type { Booking, BookingType, BookingStatus } from '@/shared/types';

export const TYPE_ICON: Record<BookingType, React.ElementType> = {
  flight:    Plane,
  hotel:     Hotel,
  cab:       Car,
  train:     Train,
  bus:       Bus,
  visa:      Shield,
  insurance: Shield,
  activity:  Activity,
  other:     Package,
};

export const TYPE_COLOR: Record<BookingType, string> = {
  flight:    'bg-blue-50 text-blue-600',
  hotel:     'bg-emerald-50 text-emerald-600',
  cab:       'bg-amber-50 text-amber-600',
  train:     'bg-violet-50 text-violet-600',
  bus:       'bg-indigo-50 text-indigo-600',
  visa:      'bg-orange-50 text-orange-600',
  insurance: 'bg-teal-50 text-teal-600',
  activity:  'bg-pink-50 text-pink-600',
  other:     'bg-gray-50 text-gray-500',
};

// ─── Detail field config (type-specific dynamic form fields) ──

export interface DetailFieldDef {
  key:         string;
  label:       string;
  type:        'text' | 'date' | 'time' | 'number' | 'textarea';
  placeholder?: string;
  span?:       'full';
}

export const DETAIL_FIELDS: Partial<Record<BookingType, DetailFieldDef[]>> = {
  flight: [
    { key: 'airline',        label: 'Airline',              type: 'text',     placeholder: 'e.g. IndiGo' },
    { key: 'pnr',            label: 'PNR',                  type: 'text',     placeholder: 'e.g. ABC123' },
    { key: 'flightNumber',   label: 'Flight Number',        type: 'text',     placeholder: 'e.g. 6E-204' },
    { key: 'origin',         label: 'From',                 type: 'text',     placeholder: 'e.g. DEL' },
    { key: 'destination',    label: 'To',                   type: 'text',     placeholder: 'e.g. BOM' },
    { key: 'departDate',     label: 'Departure Date',       type: 'date' },
    { key: 'departTime',     label: 'Departure Time',       type: 'time' },
    { key: 'arrivalDate',    label: 'Arrival Date',         type: 'date' },
    { key: 'arrivalTime',    label: 'Arrival Time',         type: 'time' },
    { key: 'terminal',       label: 'Terminal',             type: 'text',     placeholder: 'e.g. T2' },
    { key: 'baggageAllowance', label: 'Baggage Allowance', type: 'text',     placeholder: 'e.g. 15 kg' },
    { key: 'passengerNames', label: 'Passenger Names',      type: 'textarea', placeholder: 'One name per line', span: 'full' },
  ],
  hotel: [
    { key: 'hotelName',         label: 'Hotel Name',          type: 'text',    placeholder: 'e.g. The Taj Mahal Palace' },
    { key: 'city',              label: 'City',                type: 'text',    placeholder: 'e.g. Mumbai' },
    { key: 'checkIn',           label: 'Check-In Date',       type: 'date' },
    { key: 'checkOut',          label: 'Check-Out Date',      type: 'date' },
    { key: 'roomType',          label: 'Room Type',           type: 'text',    placeholder: 'e.g. Deluxe King' },
    { key: 'rooms',             label: 'Rooms',               type: 'number',  placeholder: '1' },
    { key: 'guests',            label: 'Guests',              type: 'number',  placeholder: '2' },
    { key: 'guestNames',        label: 'Guest Names',         type: 'textarea', placeholder: 'One name per line', span: 'full' },
    { key: 'confirmationNumber', label: 'Confirmation No.',   type: 'text',    placeholder: 'e.g. HTL-98765' },
  ],
  cab: [
    { key: 'pickup',       label: 'Pickup Location',  type: 'text',    placeholder: 'e.g. Indira Gandhi Airport T3' },
    { key: 'drop',         label: 'Drop Location',    type: 'text',    placeholder: 'e.g. Connaught Place' },
    { key: 'pickupDate',   label: 'Pickup Date',      type: 'date' },
    { key: 'pickupTime',   label: 'Pickup Time',      type: 'time' },
    { key: 'vehicleType',  label: 'Vehicle Type',     type: 'text',    placeholder: 'e.g. Innova Crysta' },
    { key: 'driverName',   label: 'Driver Name',      type: 'text',    placeholder: 'e.g. Ramesh Singh' },
    { key: 'driverPhone',  label: 'Driver Phone',     type: 'text',    placeholder: 'e.g. 9876543210' },
    { key: 'cabNumber',    label: 'Vehicle Number',   type: 'text',    placeholder: 'e.g. DL 01 AB 1234' },
  ],
  train: [
    { key: 'trainName',       label: 'Train Name',       type: 'text',    placeholder: 'e.g. Rajdhani Express' },
    { key: 'trainNumber',     label: 'Train Number',     type: 'text',    placeholder: 'e.g. 12301' },
    { key: 'pnr',             label: 'PNR',              type: 'text',    placeholder: 'e.g. 4567891234' },
    { key: 'fromStation',     label: 'From Station',     type: 'text',    placeholder: 'e.g. NDLS - New Delhi' },
    { key: 'toStation',       label: 'To Station',       type: 'text',    placeholder: 'e.g. CSTM - Mumbai CST' },
    { key: 'departure',       label: 'Departure Date',   type: 'date' },
    { key: 'departureTime',   label: 'Departure Time',   type: 'time' },
    { key: 'arrival',         label: 'Arrival Date',     type: 'date' },
    { key: 'arrivalTime',     label: 'Arrival Time',     type: 'time' },
    { key: 'travelClass',     label: 'Class',            type: 'text',    placeholder: 'e.g. 3A' },
    { key: 'seatNumbers',     label: 'Seat Numbers',     type: 'text',    placeholder: 'e.g. B2-32, B2-33' },
  ],
  visa: [
    { key: 'country',         label: 'Country',          type: 'text',    placeholder: 'e.g. United Arab Emirates' },
    { key: 'visaType',        label: 'Visa Type',        type: 'text',    placeholder: 'e.g. Tourist, Business' },
    { key: 'passportNumber',  label: 'Passport Number',  type: 'text',    placeholder: 'e.g. A1234567' },
    { key: 'applicationDate', label: 'Application Date', type: 'date' },
    { key: 'appointmentDate', label: 'Appointment Date', type: 'date' },
    { key: 'expectedDate',    label: 'Expected Date',    type: 'date' },
    { key: 'approvalDate',    label: 'Approval Date',    type: 'date' },
    { key: 'rejectionReason', label: 'Rejection Reason', type: 'text',    placeholder: 'If rejected', span: 'full' },
  ],
  activity: [
    { key: 'activityName',      label: 'Activity Name',    type: 'text',    placeholder: 'e.g. Desert Safari' },
    { key: 'location',          label: 'Location',         type: 'text',    placeholder: 'e.g. Dubai Desert' },
    { key: 'date',              label: 'Date',             type: 'date' },
    { key: 'time',              label: 'Time',             type: 'time' },
    { key: 'pax',              label: 'Pax',              type: 'number',  placeholder: '2' },
    { key: 'provider',          label: 'Provider',         type: 'text',    placeholder: 'e.g. Desert Adventures LLC' },
    { key: 'confirmationNumber', label: 'Confirmation No.', type: 'text',   placeholder: 'e.g. DA-2024-001' },
  ],
};

// ─── Primary date extractor ───────────────────────────────────
// Returns the most-relevant departure/check-in date for a booking
// as an ISO date string (YYYY-MM-DD), or null if none stored.
export function getBookingPrimaryDate(booking: Booking): string | null {
  const d = booking.detail as Record<string, unknown>;
  if (!d || typeof d !== 'object') return null;
  const pick = (key: string) => (typeof d[key] === 'string' ? (d[key] as string) : null);
  switch (booking.type) {
    case 'flight':   return pick('departDate');
    case 'hotel':    return pick('checkIn');
    case 'cab':      return pick('pickupDate');
    case 'train':    return pick('departure');
    case 'activity': return pick('date');
    case 'visa':     return pick('appointmentDate') ?? pick('expectedDate');
    default:         return null;
  }
}

// ─── Status Config ────────────────────────────────────────────

export const STATUS_CONFIG: Record<BookingStatus, { label: string; class: string }> = {
  pending:    { label: 'Pending',    class: 'bg-gray-100 text-gray-600'     },
  confirmed:  { label: 'Confirmed',  class: 'bg-blue-100 text-blue-700'     },
  issued:     { label: 'Issued',     class: 'bg-indigo-100 text-indigo-700' },
  submitted:  { label: 'Submitted',  class: 'bg-amber-100 text-amber-700'   },
  approved:   { label: 'Approved',   class: 'bg-emerald-100 text-emerald-700' },
  rejected:   { label: 'Rejected',   class: 'bg-red-100 text-red-600'       },
  checked_in: { label: 'Checked In', class: 'bg-teal-100 text-teal-700'     },
  departed:   { label: 'Departed',   class: 'bg-violet-100 text-violet-700' },
  completed:  { label: 'Completed',  class: 'bg-emerald-100 text-emerald-800' },
  cancelled:  { label: 'Cancelled',  class: 'bg-red-50 text-red-400'        },
};
