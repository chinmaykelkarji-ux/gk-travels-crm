// Master-data import: which spreadsheet columns feed which fields. Shared by
// the API (validation + commit) and the SPA (template download, preview).
// Headers are normalised by parseCsv (lower-case, underscores) and matched
// against each field's aliases, so "Registration No." and "reg_no" both work.

export type ImportKind = 'vendors' | 'hotels' | 'hotel-rates' | 'vehicles' | 'drivers' | 'activities';
export const IMPORT_KINDS: ImportKind[] = ['vendors', 'hotels', 'hotel-rates', 'vehicles', 'drivers', 'activities'];

export type ColumnType = 'text' | 'number' | 'date' | 'bool' | 'list';

export interface ColumnSpec {
  field:     string;
  label:     string;
  aliases:   string[];
  type?:     ColumnType;
  required?: boolean;
  example?:  string;
}

/** Same normalisation parseCsv applies to headers. */
export const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const c = (field: string, label: string, aliases: string[], opts: Partial<ColumnSpec> = {}): ColumnSpec =>
  ({ field, label, aliases: [field.toLowerCase(), normalizeHeader(label), ...aliases], type: 'text', ...opts });

export const IMPORT_COLUMNS: Record<ImportKind, ColumnSpec[]> = {
  vendors: [
    c('name', 'Name', ['vendor', 'vendor_name', 'supplier', 'supplier_name'], { required: true, example: 'Shree Sai Tours' }),
    c('kind', 'Kind', ['type', 'category', 'vendor_type'], { example: 'TRANSPORT' }),
    c('phone', 'Phone', ['mobile', 'contact_number', 'phone_number'], { required: true, example: '9876543210' }),
    c('contactPerson', 'Contact person', ['contact_person', 'contact'], { example: 'Shri Suresh Patil' }),
    c('email', 'Email', ['email_id', 'mail']),
    c('whatsapp', 'WhatsApp', ['whatsapp_number']),
    c('city', 'City', ['town'], { example: 'Belagavi' }),
    c('state', 'State', [], { example: 'Karnataka' }),
    c('gstNumber', 'GSTIN', ['gstin', 'gst', 'gst_no', 'gst_number']),
    c('pan', 'PAN', ['pan_no', 'pan_number']),
    c('paymentTerms', 'Payment terms', ['payment_terms', 'terms']),
    c('creditDays', 'Credit days', ['credit_days', 'credit'], { type: 'number' }),
    c('notes', 'Notes', ['remarks', 'comment']),
  ],
  hotels: [
    c('name', 'Hotel name', ['hotel', 'hotel_name', 'property'], { required: true, example: 'Hotel Ganga View' }),
    c('city', 'City', ['location', 'town', 'destination'], { required: true, example: 'Varanasi' }),
    c('state', 'State', [], { example: 'Uttar Pradesh' }),
    c('category', 'Category', ['star', 'star_rating', 'rating', 'class'], { example: '3 star' }),
    c('address', 'Address', []),
    c('phone', 'Phone', ['mobile', 'contact_number', 'reservation_phone']),
    c('email', 'Email', ['reservation_email', 'email_id']),
    c('gstin', 'GSTIN', ['gst', 'gst_no', 'gst_number']),
    c('checkInTime', 'Check-in time', ['check_in', 'checkin', 'check_in_time'], { example: '12:00' }),
    c('checkOutTime', 'Check-out time', ['check_out', 'checkout', 'check_out_time'], { example: '10:00' }),
    c('amenities', 'Amenities (; separated)', ['facilities'], { type: 'list', example: 'Lift; Hot water; Veg food' }),
    c('vendorName', 'Supplier / DMC', ['vendor', 'supplier', 'dmc'], {}),
    c('notes', 'Notes', ['remarks']),
  ],
  'hotel-rates': [
    c('hotel', 'Hotel name', ['hotel_name', 'property', 'name'], { required: true, example: 'Hotel Ganga View' }),
    c('city', 'City', ['location', 'town'], { required: true, example: 'Varanasi' }),
    c('roomType', 'Room type', ['room', 'room_type', 'category'], { required: true, example: 'Deluxe Double' }),
    c('mealPlan', 'Meal plan', ['meal', 'meal_plan', 'plan'], { required: true, example: 'CP' }),
    c('validFrom', 'Valid from', ['from', 'valid_from', 'start_date'], { type: 'date', required: true, example: '2026-10-01' }),
    c('validTo', 'Valid to', ['to', 'valid_to', 'end_date', 'valid_till'], { type: 'date', required: true, example: '2027-03-31' }),
    c('costPerNight', 'Cost per night', ['cost', 'net', 'net_rate', 'cost_per_night', 'buy'], { type: 'number', required: true, example: '2800' }),
    c('sellPerNight', 'Sell per night', ['sell', 'selling', 'sell_rate', 'sell_per_night'], { type: 'number', example: '3400' }),
    c('extraAdult', 'Extra adult', ['extra_adult', 'extra_bed', 'eb_adult'], { type: 'number' }),
    c('extraChild', 'Extra child', ['extra_child', 'cwb', 'child_with_bed'], { type: 'number' }),
    c('label', 'Season label', ['season', 'label'], { example: 'Winter' }),
  ],
  vehicles: [
    c('registrationNo', 'Registration no.', ['registration', 'registration_no', 'reg_no', 'vehicle_no', 'vehicle_number', 'number_plate'], { required: true, example: 'KA 22 AB 1234' }),
    c('type', 'Type', ['vehicle_type', 'category'], { required: true, example: 'Tempo Traveller' }),
    c('seats', 'Seats', ['capacity', 'seating', 'seating_capacity'], { type: 'number', required: true, example: '17' }),
    c('make', 'Make', ['brand', 'manufacturer'], { example: 'Force' }),
    c('model', 'Model', [], { example: 'Traveller 3350' }),
    c('ownership', 'Ownership (OWNED/VENDOR)', ['owned_by', 'owner_type'], { example: 'VENDOR' }),
    c('vendorName', 'Owner / vendor', ['vendor', 'owner', 'cab_owner', 'supplier'], { example: 'Shree Sai Tours' }),
    c('insuranceExpiry', 'Insurance expiry', ['insurance', 'insurance_expiry', 'insurance_valid_till'], { type: 'date' }),
    c('permitExpiry', 'Permit expiry', ['permit', 'permit_expiry', 'permit_valid_till'], { type: 'date' }),
    c('fitnessExpiry', 'Fitness expiry', ['fitness', 'fc', 'fitness_expiry'], { type: 'date' }),
    c('pucExpiry', 'PUC expiry', ['puc', 'puc_expiry', 'pollution'], { type: 'date' }),
    c('notes', 'Notes', ['remarks']),
  ],
  drivers: [
    c('name', 'Name', ['driver', 'driver_name'], { required: true, example: 'Shri Mahesh Naik' }),
    c('phone', 'Phone', ['mobile', 'contact', 'phone_number'], { required: true, example: '9845012345' }),
    c('altPhone', 'Alternate phone', ['alt_phone', 'alternate', 'phone_2']),
    c('licenceNo', 'Licence no.', ['licence', 'license', 'licence_no', 'license_no', 'dl_no', 'dl']),
    c('licenceExpiry', 'Licence expiry', ['licence_expiry', 'license_expiry', 'dl_expiry'], { type: 'date' }),
    c('languages', 'Languages (; separated)', ['language', 'speaks'], { type: 'list', example: 'Kannada; Marathi; Hindi' }),
    c('vendorName', 'Vendor', ['vendor', 'owner', 'agency']),
    c('address', 'Address', []),
    c('emergencyContact', 'Emergency contact', ['emergency', 'emergency_contact']),
    c('notes', 'Notes', ['remarks']),
  ],
  activities: [
    c('name', 'Activity', ['activity', 'activity_name', 'sightseeing', 'name'], { required: true, example: 'Ganga Aarti boat ride' }),
    c('city', 'City', ['location', 'town', 'destination'], { required: true, example: 'Varanasi' }),
    c('category', 'Category', ['type'], { example: 'Darshan' }),
    c('vendorName', 'Provider', ['vendor', 'provider', 'supplier']),
    c('durationMinutes', 'Duration (minutes)', ['duration', 'duration_minutes', 'minutes'], { type: 'number', example: '90' }),
    c('costAdult', 'Cost adult', ['cost', 'cost_adult', 'net_adult'], { type: 'number', example: '300' }),
    c('costChild', 'Cost child', ['cost_child', 'net_child'], { type: 'number' }),
    c('sellAdult', 'Sell adult', ['sell', 'sell_adult', 'price_adult'], { type: 'number', example: '450' }),
    c('sellChild', 'Sell child', ['sell_child', 'price_child'], { type: 'number' }),
    c('minPax', 'Min pax', ['min_pax', 'minimum'], { type: 'number' }),
    c('maxPax', 'Max pax', ['max_pax', 'maximum', 'capacity'], { type: 'number' }),
    c('description', 'Description', ['details']),
    c('notes', 'Notes', ['remarks']),
  ],
};

export interface HeaderMapping { byField: Record<string, string>; unknownHeaders: string[]; missingRequired: string[] }

export function mapHeaders(kind: ImportKind, headers: string[]): HeaderMapping {
  const byField: Record<string, string> = {};
  const used = new Set<string>();
  for (const spec of IMPORT_COLUMNS[kind]) {
    const aliases = spec.aliases.map(normalizeHeader);
    const hit = headers.find(h => !used.has(h) && aliases.includes(h));
    if (hit) { byField[spec.field] = hit; used.add(hit); }
  }
  return {
    byField,
    unknownHeaders: headers.filter(h => !used.has(h)),
    missingRequired: IMPORT_COLUMNS[kind].filter(s => s.required && !byField[s.field]).map(s => s.label),
  };
}

/** DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD, YYYY/MM/DD → YYYY-MM-DD; anything else is returned unchanged for the validator to reject. */
export function normalizeDate(value: string): string {
  const v = value.trim();
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return v;
}

const TRUE = new Set(['yes', 'y', 'true', '1', 'active']);
const FALSE = new Set(['no', 'n', 'false', '0', 'inactive']);

/** Turns a parsed CSV row into the shape the master's zod contract expects. Blank cells are omitted. */
export function mapRow(kind: ImportKind, row: Record<string, string>, mapping: HeaderMapping): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const spec of IMPORT_COLUMNS[kind]) {
    const header = mapping.byField[spec.field];
    if (!header) continue;
    const raw = (row[header] ?? '').trim();
    if (raw === '') continue;
    switch (spec.type) {
      case 'number': out[spec.field] = raw.replace(/[₹,\s]/g, ''); break;
      case 'date':   out[spec.field] = normalizeDate(raw); break;
      case 'list':   out[spec.field] = raw.split(/[;|]/).map(s => s.trim()).filter(Boolean); break;
      case 'bool':   out[spec.field] = TRUE.has(raw.toLowerCase()) ? true : FALSE.has(raw.toLowerCase()) ? false : raw; break;
      default:       out[spec.field] = raw;
    }
  }
  return out;
}

export function templateHeaders(kind: ImportKind): string[] {
  return IMPORT_COLUMNS[kind].map(s => s.label);
}

export function templateExample(kind: ImportKind): string[] {
  return IMPORT_COLUMNS[kind].map(s => s.example ?? '');
}
