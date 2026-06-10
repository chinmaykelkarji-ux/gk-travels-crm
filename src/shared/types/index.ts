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

// ─── Receivables (Accounts Receivable) ──────────────────────
// A standalone ledger — independent of Payment — tracking pending customer
// dues (invoices) and the entries recorded against them over time.
// ReceivableStatus is NEVER persisted: 'overdue' depends on today's date,
// so it is always derived live via calcReceivableFinance().
export type PaymentMode = 'Cash' | 'UPI' | 'Bank Transfer' | 'Card' | 'Cheque' | 'Other';
export type ReceivableStatus = 'pending' | 'partial' | 'paid' | 'overdue';

// ─── Activity Entity Type ────────────────────────────────────
// Named type for ActivityLog.entityType — prevents generic string inference
// inside Zustand set() closures where contextual typing may not flow through.
export type ActivityEntityType =
  | 'trip'
  | 'lead'
  | 'booking'
  | 'customer'
  | 'payment'
  | 'receivable'
  | 'task'
  | 'reminder'
  | 'quotation'
  | 'voucher'
  | 'itinerary'
  | 'vendor'
  | 'vendor_payment'
  | 'financial_transaction'
  | 'invoice'
  | 'credit_note'
  | 'debit_note'
  | 'company_settings'
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
  action: string;
  title?: string;
  description: string;
  entityType: ActivityEntityType;
  entityId: string;
  userId?: string;
  metadata?: Record<string, unknown> | null;
  timestamp: string;
  date: string;
  before?: unknown;
  after?: unknown;
}

// ─── Communication History (Phase 4) ─────────────────────────

export type CommunicationType = 'whatsapp' | 'email';

export interface Communication {
  id: string;
  type: CommunicationType;
  recipient: string;
  subject?: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  userId?: string | null;
  createdAt: string;
}

// ─── Quotation Approval Workflow (Phase 3) ───────────────────

export type ApprovalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  DRAFT:            'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED:         'Approved',
  REJECTED:         'Rejected',
  EXPIRED:          'Expired',
};

export const APPROVAL_STATUS_CLASS: Record<ApprovalStatus, string> = {
  DRAFT:            'bg-gray-100 text-gray-600 border border-gray-200',
  PENDING_APPROVAL: 'bg-amber-50 text-amber-700 border border-amber-200',
  APPROVED:         'bg-green-50 text-green-700 border border-green-200',
  REJECTED:         'bg-red-50 text-red-700 border border-red-200',
  EXPIRED:          'bg-gray-100 text-gray-500 border border-gray-200',
};

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
  airline?: string;
  pnr?: string;
  returnPnr?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  departDate?: string;
  departTime?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  terminal?: string;
  baggageAllowance?: string;
  passengerNames?: string;
  legs?: FlightLeg[];
}

export interface HotelDetail {
  hotelName?: string;
  city?: string;
  checkIn?: string;
  checkOut?: string;
  roomType?: string;
  rooms?: number;
  guests?: number;
  guestNames?: string;
  nights?: number;
  confirmationNumber?: string;
}

export interface CabDetail {
  pickup?: string;
  drop?: string;
  pickupDate?: string;
  pickupTime?: string;
  vehicleType?: string;
  driverName?: string;
  driverPhone?: string;
  cabNumber?: string;
}

export interface TrainDetail {
  trainName?: string;
  trainNumber?: string;
  pnr?: string;
  fromStation?: string;
  toStation?: string;
  departure?: string;
  departureTime?: string;
  arrival?: string;
  arrivalTime?: string;
  travelClass?: string;
  seatNumbers?: string;
}

export interface ActivityDetail {
  activityName?: string;
  date?: string;
  time?: string;
  pax?: number;
  location?: string;
  provider?: string;
  confirmationNumber?: string;
}

export interface VisaDetail {
  country?: string;
  visaType?: string;
  passportNumber?: string;
  applicationDate?: string;
  appointmentDate?: string;
  expectedDate?: string;
  approvalDate?: string;
  rejectionReason?: string;
}

export type BookingDetail =
  | FlightDetail
  | HotelDetail
  | CabDetail
  | TrainDetail
  | ActivityDetail
  | VisaDetail
  | Record<string, unknown>;

// ─── Core Entities ──────────────────────────────────────────

export interface Trip {
  id: string;
  /** DB-generated sequential display number ("Trip #N"). Assigned by
   *  Postgres on insert — absent for an instant on the optimistic record
   *  returned by createTrip(), then patched in once the create resolves. */
  tripNumber?: number;
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

  // Set once this trip has been included on a GST Invoice — locks it from
  // being invoiced again (cleared only if that Invoice is deleted).
  invoiceId?: string | null;

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
  timeline:     TimelineEvent[];
  itinerary:    TripItineraryDay[];
  documents:    TravelDocument[];
  passengerIds?: string[];  // PAX-YYYY-NNNN IDs, defaults to []
  flights?:     FlightDetail[];
  hotels?:      HotelDetail[];
  activities?:  unknown[];
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
  /** DB-generated sequential display number ("Customer #N"). Assigned by
   *  Postgres on insert — absent for an instant on the optimistic record
   *  returned by createCustomer(), then patched in once the create resolves. */
  customerNumber?: number;
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

  // Set once this booking has been included on a GST Invoice — locks it from
  // being invoiced again (cleared only if that Invoice is deleted).
  invoiceId?: string | null;

  // Financial (null = not priced)
  sellingPrice: number | null;
  supplierCost: number;
  advance: number;
  supplierPaid: number;
  gstRate: number;
  gstMode: GstMode;

  // Service Margin Mode (flights, trains, buses, hotels, cabs, transfers and
  // other vendor-arranged services): a fundamentally different workflow from
  // standard package/selling-price bookings — the supplier/vendor cost passes
  // through untaxed by us, and Convenience Fee is a manually entered service
  // charge (NOT derived from a selling price). GST applies ONLY on that fee —
  // never on the full supplier/vendor value. Standard selling-price logic is
  // hidden while this mode is active.
  //   Invoice Total = Supplier Cost + Convenience Fee (+ GST on fee)
  //   taxableFee / gstOnFee = GST breakdown of the convenience fee
  serviceMarginMode?: boolean;
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

  detail:       BookingDetail;
  passengerIds?: string[];
  createdDate:  string;
  notes:        string;
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

export interface ReceivableEntry {
  id: string;
  receivableId: string;
  amount: number;
  paymentDate: string;
  paymentMode: PaymentMode;
  reference?: string;
  notes?: string;
  createdAt?: string;
}

export interface Receivable {
  id: string;
  customerId?: string;
  customerName: string;
  bookingId?: string;
  tripId?: string;
  invoiceId?: string;
  invoiceAmount: number;
  description: string;
  dueDate?: string;
  // Cached aggregates — pure numeric derivations of entries, recalculated via
  // calcReceivableFinance() on every entry change (mirrors Booking.financialStatus).
  totalReceived: number;
  balanceDue: number;
  notes: string;
  entries: ReceivableEntry[];
  createdDate: string;
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

  // Internal approval workflow (Phase 3) — distinct from the customer-facing
  // `status` pipeline (draft/sent/accepted/rejected). Gates whether a
  // quotation has been reviewed by an admin before it goes out.
  approvalStatus:   ApprovalStatus;
  approvalComment?: string;
  submittedBy?:     string;
  submittedAt?:     string;
  approvedBy?:      string;
  approvedAt?:      string;

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

// ─── Passenger Master ────────────────────────────────────────

export type PassengerVisaStatus = 'none' | 'applied' | 'approved' | 'rejected' | 'expired';

export interface Passenger {
  id:                    string;   // PAX-YYYY-NNNN
  customerId?:           string;

  firstName:             string;
  lastName:              string;
  displayName?:          string;
  dateOfBirth?:          string;
  nationality?:          string;
  gender?:               string;

  passportNumber?:       string;
  passportIssueDate?:    string;
  passportExpiry?:       string;
  placeOfIssue?:         string;

  visaStatus?:           PassengerVisaStatus | string;
  visaExpiry?:           string;
  visaCountry?:          string;
  visaType?:             string;

  frequentFlyerNumber?:  string;
  mealPreference?:       string;
  seatPreference?:       string;

  emergencyContactName?:  string;
  emergencyContactPhone?: string;
  emergencyRelation?:     string;

  notes?:                string;
  createdDate:           string;
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
  passengerIds?:    string[];
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
  passengerIds?:    string[];
  internalNotes?:   string;
  createdDate:      string;
}

// ─── Company Master ───────────────────────────────────────────
// Singleton (id = "default") — GST/legal/bank details printed on
// Invoices, Credit/Debit Notes, Quotations and Vouchers.

export interface CompanySettings {
  id:                  string;
  companyName:         string;
  legalName?:          string | null;
  gstin?:              string | null;
  pan?:                string | null;
  addressLine1?:       string | null;
  addressLine2?:       string | null;
  city?:               string | null;
  state?:              string | null;
  stateCode?:          string | null;
  pincode?:            string | null;
  phone?:              string | null;
  email?:              string | null;
  website?:            string | null;
  logoUrl?:            string | null;
  bankName?:           string | null;
  bankAccountName?:    string | null;
  bankAccountNumber?:  string | null;
  bankIfsc?:           string | null;
  bankBranch?:         string | null;
  invoicePrefix:       string;
  invoiceTerms?:       string | null;
  authorizedSignatory?: string | null;
  signatureUrl?:       string | null;
  /** GST returns filed up to this date (inclusive) — invoices/CN/DN dated
   *  on or before this date are frozen (no edit/cancel/delete). */
  gstFrozenUntil?:     string | null;
}

// ─── GST Invoicing — Invoice / Credit Note / Debit Note ───────

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED';
export type CreditDebitStatus = 'ISSUED' | 'CANCELLED';
export type GstSplitType = 'INTRA' | 'INTER';

export interface InvoiceLineItem {
  id:          string;
  invoiceId?:  string;
  description: string;
  hsnSac?:     string;
  serviceType?: string;
  bookingId?:  string | null;
  quantity:    number;
  rate:        number;
  amount:      number;   // taxable value (qty * rate)
  gstRate:     number;
  gstAmount:   number;
  totalAmount: number;
  sortOrder:   number;
}

export interface Invoice {
  id:                string;       // INV-... internal id
  invoiceNumber:     string;       // GK/2026-27/01 — immutable once issued
  financialYear:     string;       // "2026-27"
  sequenceNumber:    number;
  status:            InvoiceStatus;
  invoiceDate:       string;
  dueDate?:          string | null;

  // Customer / billing snapshot
  customerId?:       string | null;
  customerName:      string;
  customerAddress?:  string | null;
  customerGstin?:    string | null;
  customerStateCode?: string | null;
  placeOfSupply?:    string | null;

  // Company snapshot at time of issue
  companyName:       string;
  companyAddress?:   string | null;
  companyGstin?:     string | null;
  companyStateCode?: string | null;

  // GST breakdown
  gstType:           GstSplitType;
  taxableAmount:     number;
  cgstAmount:        number;
  sgstAmount:        number;
  igstAmount:        number;
  totalGstAmount:    number;
  totalAmount:       number;

  notes?:            string | null;
  termsAndConds?:    string | null;

  bookingIds:        string[];
  tripIds:           string[];
  receivableId?:     string | null;

  createdDate:       string;
  createdBy?:        string | null;
  cancelledAt?:      string | null;
  cancelledBy?:      string | null;
  cancelReason?:     string | null;

  items:             InvoiceLineItem[];
}

export interface CreditDebitLineItem {
  id:           string;
  description:  string;
  hsnSac?:      string;
  quantity:     number;
  rate:         number;
  amount:       number;
  gstRate:      number;
  gstAmount:    number;
  totalAmount:  number;
  sortOrder:    number;
}

export interface CreditNote {
  id:               string;
  creditNoteNumber: string;   // CN/2026-27/0001
  financialYear:    string;
  sequenceNumber:   number;
  status:           CreditDebitStatus;
  date:             string;
  invoiceId:        string;
  customerId?:      string | null;
  customerName:     string;
  reason:           string;
  reasonDetails?:   string | null;
  taxableAmount:    number;
  cgstAmount:       number;
  sgstAmount:       number;
  igstAmount:       number;
  totalGstAmount:   number;
  totalAmount:      number;
  notes?:           string | null;
  createdDate:      string;
  createdBy?:       string | null;
  cancelledAt?:     string | null;
  cancelledBy?:     string | null;
  items:            CreditDebitLineItem[];
}

export interface DebitNote {
  id:              string;
  debitNoteNumber: string;   // DN/2026-27/0001
  financialYear:   string;
  sequenceNumber:  number;
  status:          CreditDebitStatus;
  date:            string;
  invoiceId:       string;
  customerId?:     string | null;
  customerName:    string;
  reason:          string;
  reasonDetails?:  string | null;
  taxableAmount:   number;
  cgstAmount:      number;
  sgstAmount:      number;
  igstAmount:      number;
  totalGstAmount:  number;
  totalAmount:     number;
  notes?:          string | null;
  createdDate:     string;
  createdBy?:      string | null;
  cancelledAt?:    string | null;
  cancelledBy?:    string | null;
  items:           CreditDebitLineItem[];
}

// ─── Store Root Shape ────────────────────────────────────────

export interface GKStoreState {
  trips:           Trip[];
  leads:           Lead[];
  customers:       Customer[];
  passengers:      Passenger[];
  bookings:        Booking[];
  tasks:           Task[];
  reminders:       Reminder[];
  activityLog:     ActivityLog[];
  communications:  Communication[];
  payments: {
    customerPayments: Payment[];
    supplierPayments: Payment[];
  };
  vendors:         Vendor[];
  vendorPayments:  VendorPayment[];
  quotations:      Quotation[];
  itineraries:     Itinerary[];
  vouchers:        Voucher[];
  receivables:     Receivable[];
  staff:           Staff[];
  invoices:        Invoice[];
  creditNotes:     CreditNote[];
  debitNotes:      DebitNote[];
  companySettings: CompanySettings | null;
  // Data-load lifecycle — used by AppShell to render loading/error UI
  dataLoading:     boolean;
  dataError:       string | null;
}

// ─── Invoice / Credit Note / Debit Note — request payloads ─────
// Sent to the server, which computes GST splits, document numbers,
// and receivable adjustments. See server/src/services/invoiceService.ts.

export interface InvoiceLineItemInput {
  description:  string;
  hsnSac?:      string | null;
  serviceType?: string | null;
  bookingId?:   string | null;
  quantity?:    number;
  rate:         number;
  gstRate:      number;
}

export interface CreditDebitLineItemInput {
  description: string;
  hsnSac?:     string | null;
  quantity?:   number;
  rate:        number;
  gstRate:     number;
}

export interface CreateInvoiceInput {
  invoiceDate:             string;
  dueDate?:                string | null;
  customerId?:             string | null;
  customerName:            string;
  customerAddress?:        string | null;
  customerGstin?:          string | null;
  placeOfSupply?:          string | null;
  placeOfSupplyStateCode?: string | null;
  notes?:                  string | null;
  termsAndConds?:          string | null;
  bookingIds?:             string[];
  tripIds?:                string[];
  items:                   InvoiceLineItemInput[];
}

export interface UpdateInvoiceInput {
  invoiceDate?:             string;
  dueDate?:                 string | null;
  customerName?:            string;
  customerAddress?:         string | null;
  customerGstin?:           string | null;
  placeOfSupply?:           string | null;
  placeOfSupplyStateCode?:  string | null;
  notes?:                   string | null;
  termsAndConds?:           string | null;
  items?:                   InvoiceLineItemInput[];
}

export interface CreateCreditNoteInput {
  invoiceId:      string;
  date:           string;
  reason:         string;
  reasonDetails?: string | null;
  notes?:         string | null;
  items:          CreditDebitLineItemInput[];
}

export interface CreateDebitNoteInput {
  invoiceId:      string;
  date:           string;
  reason:         string;
  reasonDetails?: string | null;
  notes?:         string | null;
  items:          CreditDebitLineItemInput[];
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
