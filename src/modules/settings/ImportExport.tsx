import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet, Download, Upload, CheckCircle2,
  AlertTriangle, Loader2, Users, Building2, MapPin, Ticket,
} from 'lucide-react';
import { useStore } from '@/store';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { toast } from '@/shared/hooks/useToast';
import { today } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import type {
  Customer, Vendor, Trip, Booking,
  VendorType, TripStatus, BookingType, BookingStatus, GstMode,
} from '@/shared/types';

// ─── Sheet definitions ──────────────────────────────────────────
// Each entity gets one sheet. Headers double as the keys used both when
// building the template/export workbook and when reading an imported file.
// Processing order matters for imports: Customers and Vendors (master data)
// are created first, then Trips, then Bookings — so Bookings can resolve
// "Customer Phone" / "Trip ID" references against records from the same file.

const CUSTOMER_HEADERS = [
  'Name*', 'Phone*', 'Alt Phone', 'Email', 'Address', 'City', 'State',
  'GST Number', 'Company Name', 'Passport No', 'Notes',
];

const CUSTOMER_SAMPLE: Record<string, unknown> = {
  'Name*': 'Jane Smith',
  'Phone*': '+91 9123456780',
  'Alt Phone': '',
  'Email': 'jane@example.com',
  'Address': '123 MG Road',
  'City': 'Mumbai',
  'State': 'Maharashtra',
  'GST Number': '',
  'Company Name': '',
  'Passport No': '',
  'Notes': 'VIP customer',
};

const VENDOR_HEADERS = [
  'Name*', 'Phone*', 'Type (hotel/transport/activity/guide/visa/miscellaneous)',
  'Company Name', 'Contact Person', 'WhatsApp', 'Email',
  'Destinations (comma-separated)', 'Payment Terms', 'GST Number', 'Notes',
];

const VENDOR_SAMPLE: Record<string, unknown> = {
  'Name*': 'Sunrise Resorts',
  'Phone*': '+91 9988776655',
  'Type (hotel/transport/activity/guide/visa/miscellaneous)': 'hotel',
  'Company Name': 'Sunrise Resorts Pvt Ltd',
  'Contact Person': 'Ramesh Kumar',
  'WhatsApp': '+91 9988776655',
  'Email': 'contact@sunrise.com',
  'Destinations (comma-separated)': 'Goa, Manali',
  'Payment Terms': '50% advance',
  'GST Number': '27ABCDE1234F1Z5',
  'Notes': 'Preferred hotel partner',
};

const TRIP_HEADERS = [
  'Customer Name*', 'Phone*', 'Email', 'Destination*', 'Type', 'Pax',
  'Departure Date (YYYY-MM-DD)', 'Return Date (YYYY-MM-DD)',
  'Status (draft/quotation/confirmed/in_progress/completed/cancelled)',
  'Total Amount', 'GST Rate (%)', 'GST Mode (INCLUDED/EXCLUDED)', 'Notes',
];

const TRIP_SAMPLE: Record<string, unknown> = {
  'Customer Name*': 'Amit Sharma',
  'Phone*': '+91 9012345678',
  'Email': 'amit@example.com',
  'Destination*': 'Manali',
  'Type': 'Leisure',
  'Pax': 4,
  'Departure Date (YYYY-MM-DD)': '2026-07-10',
  'Return Date (YYYY-MM-DD)': '2026-07-15',
  'Status (draft/quotation/confirmed/in_progress/completed/cancelled)': 'confirmed',
  'Total Amount': 85000,
  'GST Rate (%)': 5,
  'GST Mode (INCLUDED/EXCLUDED)': 'EXCLUDED',
  'Notes': 'Family trip with kids',
};

const BOOKING_TYPE_HEADER = 'Type (flight/hotel/train/bus/cab/visa/insurance/activity/other)*';
const BOOKING_STATUS_HEADER = 'Status (pending/confirmed/issued/submitted/approved/rejected/checked_in/departed/completed/cancelled)';
const BOOKING_TRIP_HEADER = 'Trip ID (optional, e.g. GK-2026-0001)';

const BOOKING_HEADERS = [
  'Customer Name*', 'Customer Phone', BOOKING_TYPE_HEADER, BOOKING_TRIP_HEADER,
  BOOKING_STATUS_HEADER, 'Selling Price', 'Supplier Cost', 'Advance',
  'Supplier Paid', 'GST Rate (%)', 'GST Mode (INCLUDED/EXCLUDED)', 'Notes',
];

const BOOKING_SAMPLE: Record<string, unknown> = {
  'Customer Name*': 'Amit Sharma',
  'Customer Phone': '+91 9012345678',
  [BOOKING_TYPE_HEADER]: 'flight',
  [BOOKING_TRIP_HEADER]: 'GK-2026-0001',
  [BOOKING_STATUS_HEADER]: 'confirmed',
  'Selling Price': 12000,
  'Supplier Cost': 9500,
  'Advance': 5000,
  'Supplier Paid': 0,
  'GST Rate (%)': 5,
  'GST Mode (INCLUDED/EXCLUDED)': 'EXCLUDED',
  'Notes': 'Mumbai → Delhi, IndiGo 6E-204',
};

// ─── Helpers ─────────────────────────────────────────────────────

function buildSheet(headers: string[], rows: Record<string, unknown>[]): XLSX.WorkSheet {
  const data = rows.map(r => headers.map(h => r[h] ?? ''));
  return XLSX.utils.aoa_to_sheet([headers, ...data]);
}

function toNumber(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

function toText(val: unknown): string {
  return val === undefined || val === null ? '' : String(val).trim();
}

function parseDateCell(val: unknown): string | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (!d) return undefined;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return s || undefined;
}

const VENDOR_TYPES: VendorType[] = ['hotel', 'transport', 'activity', 'guide', 'visa', 'miscellaneous'];
const TRIP_STATUSES: TripStatus[] = ['draft', 'quotation', 'confirmed', 'in_progress', 'completed', 'cancelled'];
const BOOKING_TYPES: BookingType[] = ['flight', 'hotel', 'train', 'bus', 'cab', 'visa', 'insurance', 'activity', 'other'];
const BOOKING_STATUSES: BookingStatus[] = [
  'pending', 'confirmed', 'issued', 'submitted', 'approved', 'rejected',
  'checked_in', 'departed', 'completed', 'cancelled',
];

// ─── Row → entity-data parsers ──────────────────────────────────

function parseCustomerRow(row: Record<string, unknown>): Partial<Customer> | null {
  const name  = toText(row['Name*']);
  const phone = toText(row['Phone*']);
  if (!name || !phone) return null;

  return {
    name,
    phone,
    altPhone:    toText(row['Alt Phone']) || undefined,
    email:       toText(row['Email']) || undefined,
    address:     toText(row['Address']) || undefined,
    city:        toText(row['City']) || undefined,
    state:       toText(row['State']) || undefined,
    gstNumber:   toText(row['GST Number']) || undefined,
    companyName: toText(row['Company Name']) || undefined,
    passportNo:  toText(row['Passport No']) || undefined,
    notes:       toText(row['Notes']) || undefined,
    tripIds:     [],
    preferences: {},
    documents:   [],
  };
}

function parseVendorRow(row: Record<string, unknown>): Partial<Vendor> | null {
  const name  = toText(row['Name*']);
  const phone = toText(row['Phone*']);
  if (!name || !phone) return null;

  const typeRaw = toText(row['Type (hotel/transport/activity/guide/visa/miscellaneous)']).toLowerCase();
  const type = VENDOR_TYPES.includes(typeRaw as VendorType) ? typeRaw as VendorType : 'miscellaneous';

  const destinations = toText(row['Destinations (comma-separated)'])
    .split(',')
    .map(d => d.trim())
    .filter(Boolean);

  return {
    name,
    phone,
    type,
    companyName:   toText(row['Company Name']) || undefined,
    contactPerson: toText(row['Contact Person']) || undefined,
    whatsapp:      toText(row['WhatsApp']) || undefined,
    email:         toText(row['Email']) || undefined,
    destinations,
    paymentTerms:  toText(row['Payment Terms']) || undefined,
    gstNumber:     toText(row['GST Number']) || undefined,
    notes:         toText(row['Notes']) || undefined,
    isActive:      true,
  };
}

function parseTripRow(row: Record<string, unknown>): Partial<Trip> | null {
  const customer    = toText(row['Customer Name*']);
  const phone       = toText(row['Phone*']);
  const destination = toText(row['Destination*']);
  if (!customer || !phone || !destination) return null;

  const statusRaw = toText(row['Status (draft/quotation/confirmed/in_progress/completed/cancelled)']).toLowerCase();
  const status = TRIP_STATUSES.includes(statusRaw as TripStatus) ? statusRaw as TripStatus : 'draft';

  const gstModeRaw = toText(row['GST Mode (INCLUDED/EXCLUDED)']).toUpperCase();
  const gstMode: GstMode = gstModeRaw === 'INCLUDED' ? 'INCLUDED' : 'EXCLUDED';

  return {
    customer,
    phone,
    email:       toText(row['Email']) || undefined,
    destination,
    type:        toText(row['Type']) || 'Leisure',
    pax:         toNumber(row['Pax']) ?? 1,
    departure:   parseDateCell(row['Departure Date (YYYY-MM-DD)']) ?? null,
    returnDate:  parseDateCell(row['Return Date (YYYY-MM-DD)']) ?? null,
    status,
    totalAmount: toNumber(row['Total Amount']),
    gstRate:     toNumber(row['GST Rate (%)']) ?? 5,
    gstMode,
    notes:       toText(row['Notes']),
  };
}

function parseBookingRow(
  row: Record<string, unknown>,
  customers: Customer[],
  trips: Trip[],
): Partial<Booking> | null {
  const customerName = toText(row['Customer Name*']);
  const typeRaw = toText(row[BOOKING_TYPE_HEADER]).toLowerCase();
  if (!customerName || !BOOKING_TYPES.includes(typeRaw as BookingType)) return null;

  const phone = toText(row['Customer Phone']);
  const matchedCustomer =
    (phone && customers.find(c => c.phone === phone)) ||
    customers.find(c => c.name.toLowerCase() === customerName.toLowerCase());

  const tripIdRaw = toText(row[BOOKING_TRIP_HEADER]);
  const matchedTrip = tripIdRaw ? trips.find(t => t.id === tripIdRaw) : undefined;

  const statusRaw = toText(row[BOOKING_STATUS_HEADER]).toLowerCase();
  const status = BOOKING_STATUSES.includes(statusRaw as BookingStatus) ? statusRaw as BookingStatus : 'pending';

  const gstModeRaw = toText(row['GST Mode (INCLUDED/EXCLUDED)']).toUpperCase();
  const gstMode: GstMode = gstModeRaw === 'INCLUDED' ? 'INCLUDED' : 'EXCLUDED';

  return {
    customerName,
    customerId:   matchedCustomer?.id,
    type:         typeRaw as BookingType,
    refId:        matchedTrip?.id,
    status,
    sellingPrice: toNumber(row['Selling Price']),
    supplierCost: toNumber(row['Supplier Cost']) ?? 0,
    advance:      toNumber(row['Advance']) ?? 0,
    supplierPaid: toNumber(row['Supplier Paid']) ?? 0,
    gstRate:      toNumber(row['GST Rate (%)']) ?? 0,
    gstMode,
    notes:        toText(row['Notes']),
    detail:       {},
  };
}

// ─── Entity → row mappers (for export) ──────────────────────────

function customerToRow(c: Customer): Record<string, unknown> {
  return {
    'Name*': c.name,
    'Phone*': c.phone,
    'Alt Phone': c.altPhone ?? '',
    'Email': c.email ?? '',
    'Address': c.address ?? '',
    'City': c.city ?? '',
    'State': c.state ?? '',
    'GST Number': c.gstNumber ?? '',
    'Company Name': c.companyName ?? '',
    'Passport No': c.passportNo ?? '',
    'Notes': c.notes ?? '',
  };
}

function vendorToRow(v: Vendor): Record<string, unknown> {
  return {
    'Name*': v.name,
    'Phone*': v.phone,
    'Type (hotel/transport/activity/guide/visa/miscellaneous)': v.type,
    'Company Name': v.companyName ?? '',
    'Contact Person': v.contactPerson ?? '',
    'WhatsApp': v.whatsapp ?? '',
    'Email': v.email ?? '',
    'Destinations (comma-separated)': (v.destinations ?? []).join(', '),
    'Payment Terms': v.paymentTerms ?? '',
    'GST Number': v.gstNumber ?? '',
    'Notes': v.notes ?? '',
  };
}

function tripToRow(t: Trip): Record<string, unknown> {
  return {
    'Customer Name*': t.customer,
    'Phone*': t.phone,
    'Email': t.email ?? '',
    'Destination*': t.destination,
    'Type': t.type,
    'Pax': t.pax,
    'Departure Date (YYYY-MM-DD)': t.departure ?? '',
    'Return Date (YYYY-MM-DD)': t.returnDate ?? '',
    'Status (draft/quotation/confirmed/in_progress/completed/cancelled)': t.status,
    'Total Amount': t.totalAmount ?? '',
    'GST Rate (%)': t.gstRate,
    'GST Mode (INCLUDED/EXCLUDED)': t.gstMode,
    'Notes': t.notes,
  };
}

function bookingToRow(b: Booking, customers: Customer[]): Record<string, unknown> {
  const cust = customers.find(c => c.id === b.customerId);
  return {
    'Customer Name*': b.customerName,
    'Customer Phone': cust?.phone ?? '',
    [BOOKING_TYPE_HEADER]: b.type,
    [BOOKING_TRIP_HEADER]: b.refId ?? '',
    [BOOKING_STATUS_HEADER]: b.status,
    'Selling Price': b.sellingPrice ?? '',
    'Supplier Cost': b.supplierCost,
    'Advance': b.advance,
    'Supplier Paid': b.supplierPaid,
    'GST Rate (%)': b.gstRate,
    'GST Mode (INCLUDED/EXCLUDED)': b.gstMode,
    'Notes': b.notes,
  };
}

// ─── Import result ───────────────────────────────────────────────

interface ImportResult {
  customers: number;
  vendors: number;
  trips: number;
  bookings: number;
  errors: string[];
}

const SHEETS = [
  { name: 'Customers', icon: Users,     headers: CUSTOMER_HEADERS, sample: CUSTOMER_SAMPLE },
  { name: 'Vendors',   icon: Building2, headers: VENDOR_HEADERS,   sample: VENDOR_SAMPLE },
  { name: 'Trips',     icon: MapPin,    headers: TRIP_HEADERS,     sample: TRIP_SAMPLE },
  { name: 'Bookings',  icon: Ticket,    headers: BOOKING_HEADERS,  sample: BOOKING_SAMPLE },
];

// ─── Component ───────────────────────────────────────────────────

export default function ImportExportTab() {
  const customers = useStore(s => s.customers);
  const vendors   = useStore(s => s.vendors);
  const trips     = useStore(s => s.trips);
  const bookings  = useStore(s => s.bookings);

  const createCustomer = useStore(s => s.createCustomer);
  const createVendor   = useStore(s => s.createVendor);
  const createTrip     = useStore(s => s.createTrip);
  const createBooking  = useStore(s => s.createBooking);

  const [importing, setImporting] = useState(false);
  const [dragOver,  setDragOver]  = useState(false);
  const [result,    setResult]    = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDownloadTemplate() {
    const wb = XLSX.utils.book_new();
    for (const sheet of SHEETS) {
      const ws = buildSheet(sheet.headers, [sheet.sample]);
      XLSX.utils.book_append_sheet(wb, ws, sheet.name);
    }
    XLSX.writeFile(wb, 'GK-Travels-CRM-Import-Template.xlsx');
  }

  function handleExport() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildSheet(CUSTOMER_HEADERS, customers.map(customerToRow)), 'Customers');
    XLSX.utils.book_append_sheet(wb, buildSheet(VENDOR_HEADERS, vendors.map(vendorToRow)), 'Vendors');
    XLSX.utils.book_append_sheet(wb, buildSheet(TRIP_HEADERS, trips.map(tripToRow)), 'Trips');
    XLSX.utils.book_append_sheet(wb, buildSheet(BOOKING_HEADERS, bookings.map(b => bookingToRow(b, customers))), 'Bookings');
    XLSX.writeFile(wb, `GK-Travels-CRM-Export_${today()}.xlsx`);
  }

  async function processFile(file: File) {
    setImporting(true);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array' });
      const out: ImportResult = { customers: 0, vendors: 0, trips: 0, bookings: 0, errors: [] };

      // Customers and Vendors first — master data referenced by Bookings.
      if (wb.SheetNames.includes('Customers')) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Customers'], { defval: '' });
        rows.forEach((row, i) => {
          const data = parseCustomerRow(row);
          if (!data) { out.errors.push(`Customers row ${i + 2}: Name and Phone are required — skipped`); return; }
          createCustomer(data);
          out.customers++;
        });
      }

      if (wb.SheetNames.includes('Vendors')) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Vendors'], { defval: '' });
        rows.forEach((row, i) => {
          const data = parseVendorRow(row);
          if (!data) { out.errors.push(`Vendors row ${i + 2}: Name and Phone are required — skipped`); return; }
          createVendor(data);
          out.vendors++;
        });
      }

      if (wb.SheetNames.includes('Trips')) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Trips'], { defval: '' });
        rows.forEach((row, i) => {
          const data = parseTripRow(row);
          if (!data) { out.errors.push(`Trips row ${i + 2}: Customer Name, Phone and Destination are required — skipped`); return; }
          createTrip(data);
          out.trips++;
        });
      }

      // Bookings last — can reference Customers/Trips imported above.
      if (wb.SheetNames.includes('Bookings')) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Bookings'], { defval: '' });
        const allCustomers = useStore.getState().customers;
        const allTrips     = useStore.getState().trips;
        rows.forEach((row, i) => {
          const data = parseBookingRow(row, allCustomers, allTrips);
          if (!data) { out.errors.push(`Bookings row ${i + 2}: Customer Name and a valid Type are required — skipped`); return; }
          createBooking(data);
          out.bookings++;
        });
      }

      const totalImported = out.customers + out.vendors + out.trips + out.bookings;
      if (totalImported === 0 && out.errors.length === 0) {
        out.errors.push('No matching sheets found. Use the sample template — sheet names must be Customers, Vendors, Trips or Bookings.');
      }

      setResult(out);
      if (totalImported > 0) {
        toast.success('Import complete', `${totalImported} record${totalImported !== 1 ? 's' : ''} imported.`);
      } else {
        toast.error('Nothing imported', 'Check the file format and try again.');
      }
    } catch {
      toast.error('Import failed', 'Could not read this file. Make sure it is a valid .xlsx file.');
    } finally {
      setImporting(false);
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  return (
    <div className="space-y-4">
      {/* Template + Export */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> Sample Template
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-500">
              Download a starter workbook with one sheet per entity (Customers,
              Vendors, Trips, Bookings), pre-filled with a sample row showing the
              expected format.
            </p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleDownloadTemplate}>
              <Download className="w-3.5 h-3.5" /> Download Template
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Download className="w-4 h-4 text-indigo-600" /> Export Current Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-500">
              Export all current Customers, Vendors, Trips and Bookings to a
              single Excel workbook — useful for backups or bulk edits.
            </p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExport}>
              <Download className="w-3.5 h-3.5" /> Export to Excel
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Import */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Upload className="w-4 h-4 text-indigo-600" /> Import Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-gray-500">
            Upload a filled-in copy of the template. Each sheet (Customers,
            Vendors, Trips, Bookings) is processed independently — you can
            include just the sheets you need. New records are created with
            auto-generated IDs; existing records are not modified. For
            Bookings, "Customer Phone" and "Trip ID" are matched against
            existing (or just-imported) Customers and Trips to link the
            records.
          </p>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors',
              dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            {importing ? (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                <p className="text-sm">Importing…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <Upload className="w-6 h-6 text-gray-400" />
                <p className="text-sm font-medium text-gray-700">
                  Drop your Excel file here, or click to browse
                </p>
                <p className="text-xs text-gray-400">.xlsx or .xls — based on the sample template</p>
              </div>
            )}
          </div>

          {result && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Customers', count: result.customers },
                  { label: 'Vendors',   count: result.vendors },
                  { label: 'Trips',     count: result.trips },
                  { label: 'Bookings',  count: result.bookings },
                ].map(item => (
                  <div key={item.label} className="text-center p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="text-xl font-bold text-emerald-700 font-display flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> {item.count}
                    </div>
                    <div className="text-xs text-emerald-700/80 mt-1">{item.label} imported</div>
                  </div>
                ))}
              </div>

              {result.errors.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-700 text-xs font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" /> {result.errors.length} row(s) skipped
                  </div>
                  <ul className="text-xs text-amber-700/90 list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
                    {result.errors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
