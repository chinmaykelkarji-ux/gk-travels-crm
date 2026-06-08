// ============================================================
// GK TRAVELS CRM — ENTERPRISE TYPE DEFINITIONS
// Single source of truth for all entity shapes.
// ============================================================

// ─── Enumerations ───────────────────────────────────────────

export type TripStatus =
  | 'draft'
  | 'quotation'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'follow_up'
  | 'quotation_sent'
  | 'confirmed'
  | 'converted'
  | 'cancelled';

export type BookingType =
  | 'flight'
  | 'hotel'
  | 'train'
  | 'bus'
  | 'cab'
  | 'visa'
  | 'insurance'
  | 'activity'
  | 'other';

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'issued'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'checked_in'
  | 'departed'
  | 'completed'
  | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export type DocumentCategory =
  | 'passport'
  | 'visa'
  | 'insurance'
  | 'flight_ticket'
  | 'hotel_voucher'
  | 'pan_card'
  | 'aadhaar'
  | 'other';

export type UserRole = 'super_admin' | 'admin' | 'finance' | 'operations' | 'sales';

// ─── Financial Status (P0 Fix) ──────────────────────────────
// Never compute this inline. Always use getFinancialStatus() from utils/finance.ts
// NOTE: FinancialStatus is SEPARATE from TripStatus/BookingStatus.
//       TripStatus describes workflow state; FinancialStatus describes payment state.
//       They must NEVER share a field name on the same entity.
export type FinancialStatus = 'unpriced' | 'unpaid' | 'partial' | 'paid';

// ─── GST Mode ───────────────────────────────────────────────
// EXCLUDED: entered amount is the taxable base — GST is added on top.
// INCLUDED: entered amount already contains GST — taxable base is back-calculated.
// Always compute via calcGst() from utils/finance.ts.
export type GstMode = 'INCLUDED' | 'EXCLUDED';

// ─── Activity Entity Type ────────────────────────────────────
// Named type for ActivityLog.entityType — prevents generic string inference
// inside Zustand set() closures where contextual typing may not flow through.
export type ActivityEntityType =
  | 'trip'
  | 'lead'
  | 'booking'
  | 'customer'
  | 'payment'
  | 'task'
  | 'system';

// ─── Timeline & Audit ───────────────────────────────────────

export interface TimelineEvent {
  id: string;
  date: string;
  event: string;
  type: 'info' | 'payment' | 'booking' | 'warning' | 'success' | 'system' | 'done';
  userId?: string;
}

export interface ActivityLog {
  id: string;
  type: string;
  message: string;
  entityType: ActivityEntityType;
  entityId: string;
  userId?: string;
  timestamp: string;
  date: string;
  before?: unknown;
  after?: unknown;
}

// ─── Document ───────────────────────────────────────────────

export interface TravelDocument {
  id: string;
  name: string;
  category: DocumentCategory;
  tripId?: string;
  bookingId?: string;
  customerId?: string;
  url?: string;        // Future: Cloudinary/S3
  base64?: string;     // Current: localStorage compat
  mimeType: string;
  size: number;
  uploadedDate: string;
}

// ─── Trip Itinerary Day (inline JSON on Trip — legacy) ───────
// The standalone Itinerary module (Phase 5) uses its own ItineraryDay below.

export interface TripItineraryDay {
  day: number;
  date?: string;
  title: string;
  description: string;
  activities: string[];
  meals: ('breakfast' | 'lunch' | 'dinner')[];
  accommodation?: string;
}

// ─── Flight Sub-types ────────────────────────────────────────

export interface FlightLeg {
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departDate: string;
  departTime: string;
  arrivalDate: string;
  arrivalTime: string;
  terminal?: string;
  baggageAllowance?: string;
}

export interface FlightDetail {
  pnr: string;
  returnPnr?: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departDate: string;
  departTime: string;
  arrivalDate: string;
  arrivalTime: string;
  terminal?: string;
  baggageAllowance?: string;
  legs: FlightLeg[];
}

export interface HotelDetail {
  hotelName: string;
  city: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  nights: number;
  confirmationNumber?: string;
}

export interface VisaDetail {
  country: string;
  visaType: string;
  applicationDate?: string;
  expectedDate?: string;
  approvalDate?: string;
  rejectionReason?: string;
}

export type BookingDetail = FlightDetail | HotelDetail | VisaDetail | Record<string, unknown>;

// ─── Core Entities ──────────────────────────────────────────

export interface Trip {
  id: string;
  customer: string;
  phone: string;
  email?: string;
  customerId?: string;
  destination: string;
  type: string;
  pax: number;
  departure: string | null;
  returnDate: string | null;
  status: TripStatus;

  // Financial (null = price not set — NEVER default to 0 to avoid false "paid")
  totalAmount: number | null;
  gstRate: number;
  gstMode: GstMode;
  discount?: number;

  // Computed financial fields (set by calcTripFinance in store)
  gstAmount: number;
  taxableAmount: number;
  totalPayable: number | null;
  paidAmount: number;
  balanceDue: number;
  supplierCost: number;
  grossMargin: number;   // NOTE: was netProfit in v1 — renamed for financial accuracy
  marginPct: number;

  // Operational flags
  visaStatus: 'not_required' | 'pending' | 'submitted' | 'approved' | 'rejected';
  hotelStatus: 'pending' | 'booked' | 'confirmed';
  flightStatus: 'pending' | 'booked' | 'issued';
  checkInStatus: 'pending' | 'done' | 'not_due';
  transferStatus?: string;
  voucherStatus?: string;

  // Optional linked data (inline for v1 compat)
  hotelName?: string;
  hotelCheckIn?: string;
  hotelCheckOut?: string;
  hotelRef?: string;
  flightPNR?: string;
  airline?: string;
  flightNumber?: string;
  flightTime?: string;
  returnFlightPNR?: string;
  returnFlightNumber?: string;
  returnFlightTime?: string;
  visaCountry?: string;
  visaExpiry?: string;
  transportMode?: string;
  cabNumber?: string;
  cabDriver?: string;
  cabContact?: string;

  assignedTo?: string;
  notes: string;
  createdDate: string;
  createdBy?: string;

  // Conversion audit
  sourceLeadId?: string;
  convertedFromLeadId?: string;
  convertedAt?: string;
  convertedBy?: string;

  // Nested collections
  timeline: TimelineEvent[];
  itinerary: TripItineraryDay[];
  documents: TravelDocument[];
  flights?: FlightDetail[];
  hotels?: HotelDetail[];
  activities?: unknown[];
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source: string;
  destination: string;
  travelDate?: string;
  travelDates?: string;
  returnDate?: string;
  pax: number;
  budget: number | null;
  tripType: string;
  status: LeadStatus;
  priority: 'low' | 'medium' | 'high';
  notes: string;
  followUpDate?: string;
  assignedTo?: string;
  createdDate: string;

  // Conversion audit
  convertedTripId?: string;
  convertedCustomerId?: string;
  convertedAt?: string;
  convertedBy?: string;

  timeline: TimelineEvent[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  altPhone?: string;
  email?: string;
  address?: string;
  city?: string;

  // GST / business details — OPTIONAL (retail customers don't need GST)
  gstNumber?: string;
  companyName?: string;
  billingAddress?: string;
  state?: string;
  gstRegistered?: boolean;

  // Identity documents
  passportNo?: string;
  passportExpiry?: string;
  passportCountry?: string;
  panNumber?: string;
  aadhaarNumber?: string;

  // Preferences
  preferences: {
    seatPreference?: string;
    mealPreference?: string;
    hotelPreference?: string;
    notes?: string;
  } | string;
  notes?: string;

  // Linked IDs
  tripIds: string[];
  bookingIds?: string[];

  createdDate: string;
  sourceLeadId?: string;
  documents: TravelDocument[];
  timeline?: TimelineEvent[];
}

export interface Booking {
  id: string;
  type: BookingType;
  status: BookingStatus;
  customerName: string;
  customerId?: string;
  refId?: string;  // linked trip ID

  // Financial (null = not priced)
  sellingPrice: number | null;
  supplierCost: number;
  advance: number;
  supplierPaid: number;
  gstRate: number;
  gstMode: GstMode;

  // Ticket Booking Mode (flight/train/bus): a fundamentally different
  // workflow from standard package/hotel bookings. Convenience Fee is a
  // manually entered service charge (NOT derived from selling price); GST
  // applies ONLY on it — never on the full ticket value. Standard
  // selling-price logic is hidden while this mode is active.
  //   Invoice Total = Supplier Cost + Convenience Fee (+ GST on fee)
  //   taxableFee / gstOnFee = GST breakdown of the convenience fee
  ticketBookingMode?: boolean;
  convenienceFee?: number;
  taxableFee?: number;
  gstOnFee?: number;

  // Computed financial (set by calcBookingFinance — stored as a cache on the entity)
  gstAmount: number;
  taxableAmount: number;
  totalPayable: number | null;
  balanceDue: number;
  supplierPending: number;
  grossMargin: number;
  marginPct: number;
  // financialStatus is SEPARATE from status (BookingStatus) — never overwrite status with it
  financialStatus?: FinancialStatus;

  detail: BookingDetail;
  createdDate: string;
  notes: string;
}

export interface Payment {
  id: string;
  type: 'customer' | 'supplier';
  tripId?: string;
  bookingId?: string;
  customer?: string;
  customerId?: string;
  amount: number;
  method: string;
  date: string;
  // paidDate: optional separate field for when supplier payment was settled,
  // distinct from date (when the payment was recorded). Used in monthly reports.
  paidDate?: string;
  status: 'pending' | 'received' | 'paid';
  reference?: string;
  notes?: string;
}

export interface Task {
  id: string;
  tripId?: string;
  bookingId?: string;
  customerId?: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  assignedTo?: string;
  completedDate?: string;
  createdDate: string;
}

export interface Reminder {
  id: string;
  tripId?: string;
  bookingId?: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  message: string;
  dueDate: string;
  sent: boolean;
  sentAt?: string;
}

// ─── Quotation ───────────────────────────────────────────────

export type QuotationStatus   = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
export type QuotationCategory = 'hotel' | 'flight' | 'transfer' | 'activity' | 'visa' | 'insurance' | 'misc';

export interface QuotationItem {
  id:           string;
  quotationId:  string;
  category:     QuotationCategory;
  description:  string;
  quantity:     number;
  costPrice:    number;
  sellingPrice: number;
  vendorId?:    string;
  vendorName?:  string;
  // Computed per line
  totalCost:    number;
  totalSelling: number;
  grossProfit:  number;
  marginPct:    number;
  sortOrder:    number;
}

export interface Quotation {
  id:              string;   // Q-2025-0001
  quotationNumber: string;   // same value — display string
  customerId?:     string;
  customerName:    string;
  customerPhone?:  string;
  customerEmail?:  string;
  destination:     string;
  startDate?:      string;
  endDate?:        string;
  pax:             number;
  status:          QuotationStatus;
  notes?:          string;
  termsAndConds?:  string;
  validUntil?:     string;
  inclusions?:     string;
  exclusions?:     string;
  paymentPolicy?:  string;

  // Financial summary
  gstRate:       number;
  gstMode:       GstMode;
  gstAmount:     number;
  taxableAmount: number;
  totalCost:    number;
  totalSelling: number;
  grossProfit:  number;
  marginPct:    number;

  // Conversion
  convertedTripId?: string;
  convertedAt?:     string;

  createdDate: string;
  sentAt?:     string;
  acceptedAt?: string;
  rejectedAt?: string;

  items: QuotationItem[];
}

export interface Staff {
  id: number;
  name: string;
  role: string;
  email?: string;
  trips: number;
  tasks: number;
  avatar: string;
}

// ─── Vendor ──────────────────────────────────────────────────

export type VendorType =
  | 'hotel'
  | 'transport'
  | 'activity'
  | 'guide'
  | 'visa'
  | 'miscellaneous';

export interface VendorBankDetails {
  accountNo?:      string;
  ifsc?:           string;
  bankName?:       string;
  accountHolder?:  string;
}

export interface Vendor {
  id:            string;
  name:          string;
  companyName?:  string;
  type:          VendorType;
  contactPerson?: string;
  phone:         string;
  whatsapp?:     string;
  email?:        string;
  destinations:  string[];
  paymentTerms?: string;
  bankDetails:   VendorBankDetails;
  gstNumber?:    string;
  notes?:        string;
  isActive:      boolean;
  createdDate:   string;
}

export interface VendorPayment {
  id:           string;
  vendorId:     string;
  vendorName:   string;
  tripId?:      string;
  tripName?:    string;
  description?: string;
  totalCost:    number;
  advancePaid:  number;
  outstanding:  number;   // = totalCost - advancePaid (computed, stored)
  isPaid:       boolean;
  paidDate?:    string;
  dueDate?:     string;
  notes?:       string;
  createdDate:  string;
}

// ─── Itinerary ───────────────────────────────────────────────

export type ItineraryStatus   = 'draft' | 'finalized';
export type ItineraryTemplate = 'domestic' | 'international' | 'luxury' | 'honeymoon' | 'family';
export type MealType          = 'breakfast' | 'lunch' | 'dinner';

export interface ItineraryDay {
  id:           string;
  itineraryId:  string;
  dayNumber:    number;
  date?:        string;
  title:        string;
  morning?:     string;
  afternoon?:   string;
  evening?:     string;
  hotelName?:   string;
  hotelAddress?: string;
  meals:        MealType[];
  transfers?:   string;
  activities:   string[];
  notes?:       string;
  sortOrder:    number;
}

export interface Itinerary {
  id:               string;   // ITN-YYYY-NNNN
  tripId?:          string;
  quotationId?:     string;
  title:            string;
  destination:      string;
  customerName:     string;
  customerPhone?:   string;
  customerEmail?:   string;
  startDate?:       string;
  endDate?:         string;
  pax:              number;
  status:           ItineraryStatus;
  notes?:           string;
  emergencyContact?: string;
  template?:        ItineraryTemplate;
  createdDate:      string;
  days:             ItineraryDay[];
}

// ─── Voucher ─────────────────────────────────────────────────

export type VoucherType   = 'hotel' | 'transfer' | 'activity' | 'flight' | 'visa' | 'general';
export type VoucherStatus = 'draft' | 'issued' | 'completed' | 'cancelled';

export interface Voucher {
  id:            string;    // VCH-YYYY-NNNN
  voucherNumber: string;    // same as id
  tripId?:       string;
  customerId?:   string;
  vendorId?:     string;
  type:          VoucherType;
  status:        VoucherStatus;
  issueDate?:    string;

  // Customer / guests
  customerName:  string;
  customerPhone?: string;
  guestNames?:   string;
  destination?:  string;

  // Hotel
  hotelName?:      string;
  hotelAddress?:   string;
  hotelPhone?:     string;
  checkIn?:        string;
  checkOut?:       string;
  roomType?:       string;
  mealPlan?:       string;
  confirmationNo?: string;
  nights?:         number;

  // Transfer
  pickupPoint?: string;
  dropPoint?:   string;
  pickupDate?:  string;
  pickupTime?:  string;
  vehicleType?: string;
  driverName?:  string;
  driverPhone?: string;
  flightInfo?:  string;

  // Activity
  activityName?:  string;
  activityDate?:  string;
  activityTime?:  string;
  activityVenue?: string;
  activityNotes?: string;

  // Flight
  airline?:       string;
  flightNumber?:  string;
  pnr?:           string;
  departure?:     string;
  arrival?:       string;
  departureDate?: string;
  arrivalDate?:   string;
  flightClass?:   string;

  // Visa
  visaType?:  string;
  country?:   string;
  entryType?: string;
  validity?:  string;
  visaFee?:   number;

  // Vendor (denormalized)
  vendorName?:  string;
  vendorPhone?: string;
  vendorEmail?: string;

  // GST
  gstRate?:        number;
  gstMode?:        GstMode;
  gstAmount?:      number;
  taxableAmount?:  number;
  totalPayable?:   number | null;

  // Common
  pax:              number;
  notes?:           string;
  emergencyContact?: string;
  internalNotes?:   string;
  createdDate:      string;
}

// ─── Store Root Shape ────────────────────────────────────────

export interface GKStoreState {
  trips:           Trip[];
  leads:           Lead[];
  customers:       Customer[];
  bookings:        Booking[];
  tasks:           Task[];
  reminders:       Reminder[];
  activityLog:     ActivityLog[];
  payments: {
    customerPayments: Payment[];
    supplierPayments: Payment[];
  };
  vendors:         Vendor[];
  vendorPayments:  VendorPayment[];
  quotations:      Quotation[];
  itineraries:     Itinerary[];
  vouchers:        Voucher[];
  staff:           Staff[];
  // Data-load lifecycle — used by AppShell to render loading/error UI
  dataLoading:     boolean;
  dataError:       string | null;
}

// ─── Form Shapes (subset of entities, used by React Hook Form) ─

export interface TripFormValues {
  customer: string;
  phone: string;
  destination: string;
  pax: number;
  departure: string;
  returnDate?: string;
  type: string;
  totalAmount?: number;
  gstRate?: number;
  notes?: string;
}

export interface LeadFormValues {
  name: string;
  phone: string;
  email?: string;
  source: string;
  destination?: string;
  travelDate?: string;
  pax?: number;
  budget?: number;
  tripType?: string;
  priority?: 'low' | 'medium' | 'high';
  notes?: string;
  assignedTo?: string;
  followUpDate?: string;
}
