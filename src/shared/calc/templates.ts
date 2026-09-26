// ============================================================
// Message templates — placeholders, the system set, and rendering.
//
// A template is plain text with {{placeholders}}. Rendering never sends a
// message with a gap in it: a placeholder with no value is reported as
// missing and the send is refused, and an unknown placeholder is refused when
// the template is saved. Dependency-free: the screen previews with the same
// code the server sends with.
// ============================================================

export type TemplateChannel = 'WHATSAPP' | 'EMAIL';
export const TEMPLATE_CHANNELS: TemplateChannel[] = ['WHATSAPP', 'EMAIL'];

export interface PlaceholderDef { key: string; label: string; sample: string }

/** Every placeholder a template may use, with what it means and a sample for the preview. */
export const PLACEHOLDERS: PlaceholderDef[] = [
  { key: 'customer_name', label: 'Customer name', sample: 'Ramesh Patil' },
  { key: 'traveller_name', label: 'Traveller name', sample: 'Sunita Patil' },
  { key: 'destination', label: 'Destination', sample: 'Varanasi' },
  { key: 'trip_name', label: 'Tour name', sample: 'Kashi Yatra' },
  { key: 'trip_id', label: 'Trip id', sample: 'GK-2026-0007' },
  { key: 'departure_date', label: 'Departure date', sample: '12 Nov 2026' },
  { key: 'return_date', label: 'Return date', sample: '18 Nov 2026' },
  { key: 'pax', label: 'Number travelling', sample: '42' },
  { key: 'amount_due', label: 'Amount still due', sample: '₹45,000' },
  { key: 'due_date', label: 'Due date', sample: '5 Nov 2026' },
  { key: 'amount_paid', label: 'Amount received', sample: '₹25,000' },
  { key: 'receipt_number', label: 'Receipt number', sample: 'RCPT-2026-0012' },
  { key: 'quote_number', label: 'Quotation number', sample: 'Q-2026-0031' },
  { key: 'quote_total', label: 'Quotation total', sample: '₹1,85,000' },
  { key: 'pickup_point', label: 'Pickup point', sample: 'Belagavi — Central Bus Stand' },
  { key: 'pickup_time', label: 'Pickup time', sample: '10 Nov 2026, 9:30 pm' },
  { key: 'pnr', label: 'PNR', sample: '4567890123' },
  { key: 'ticket_status', label: 'Ticket status', sample: 'confirmed' },
  { key: 'journey', label: 'Journey', sample: 'Belagavi → Varanasi, 12779 Goa Express' },
  { key: 'hotel_name', label: 'Hotel', sample: 'Ganga View, Varanasi' },
  { key: 'driver_name', label: 'Driver name', sample: 'Suresh' },
  { key: 'driver_phone', label: 'Driver phone', sample: '98765 43210' },
  { key: 'vehicle_number', label: 'Vehicle number', sample: 'KA-22 AB 1234' },
  { key: 'passport_expiry', label: 'Passport valid until', sample: '3 Feb 2027' },
  { key: 'document_needed', label: 'Document needed', sample: 'passport copy' },
  { key: 'portal_link', label: 'Customer page link', sample: 'https://travelos.example/p/abc123' },
  { key: 'agency_name', label: 'Agency name', sample: 'GK Travels' },
  { key: 'agency_phone', label: 'Agency phone', sample: '0831 240 0000' },
];
export const PLACEHOLDER_KEYS = new Set(PLACEHOLDERS.map(p => p.key));
export const SAMPLE_VALUES: Record<string, string> = Object.fromEntries(PLACEHOLDERS.map(p => [p.key, p.sample]));

export interface SystemTemplate { key: string; name: string; purpose: string; subject: string; body: string }

/**
 * The set GK Travels sends most. Polite and respectful ("Namaste … Ji"),
 * facts only, and every one signs off as the agency. The same wording serves
 * WhatsApp and email; email adds the subject.
 */
export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  { key: 'enquiry_received', name: 'Enquiry received', purpose: 'Thank a customer for a new enquiry',
    subject: 'Your enquiry for {{destination}}',
    body: 'Namaste {{customer_name}} Ji,\nThank you for your enquiry for {{destination}}. Our team will share the plan and the price with you shortly.\n— {{agency_name}}, {{agency_phone}}' },
  { key: 'quotation_sent', name: 'Quotation sent', purpose: 'Share a quotation',
    subject: 'Quotation {{quote_number}} — {{destination}}',
    body: 'Namaste {{customer_name}} Ji,\nPlease find our quotation {{quote_number}} for {{destination}}: {{quote_total}}. Kindly let us know if you would like any change.\n— {{agency_name}}, {{agency_phone}}' },
  { key: 'booking_confirmed', name: 'Booking confirmed', purpose: 'Confirm a booking to the customer',
    subject: 'Booking confirmed — {{trip_name}}',
    body: 'Namaste {{customer_name}} Ji,\nYour {{trip_name}} ({{trip_id}}) is confirmed, departing {{departure_date}} and returning {{return_date}}. Thank you for travelling with us.\n— {{agency_name}}, {{agency_phone}}' },
  { key: 'payment_reminder', name: 'Payment reminder', purpose: 'Remind a customer of an amount due',
    subject: 'Payment reminder — {{trip_name}}',
    body: 'Namaste {{customer_name}} Ji,\nA gentle reminder that {{amount_due}} is due by {{due_date}} for {{trip_name}} ({{trip_id}}). Please ignore this if you have already paid.\n— {{agency_name}}, {{agency_phone}}' },
  { key: 'payment_received', name: 'Payment received', purpose: 'Thank a customer for a payment',
    subject: 'Payment received — {{receipt_number}}',
    body: 'Namaste {{customer_name}} Ji,\nWe have received {{amount_paid}} for {{trip_name}} (receipt {{receipt_number}}). Thank you.\n— {{agency_name}}, {{agency_phone}}' },
  { key: 'ticket_update', name: 'Ticket update', purpose: 'Tell a customer where their ticket stands',
    subject: 'Ticket {{pnr}} — {{ticket_status}}',
    body: 'Namaste {{customer_name}} Ji,\nYour ticket for {{journey}} (PNR {{pnr}}) is {{ticket_status}}.\n— {{agency_name}}, {{agency_phone}}' },
  { key: 'departure_reminder', name: 'Departure reminder', purpose: 'Remind the group of the pickup the day before',
    subject: 'Tomorrow: {{trip_name}}',
    body: 'Namaste {{customer_name}} Ji,\nYour {{trip_name}} starts tomorrow. Pickup: {{pickup_point}} at {{pickup_time}}. Please carry an original photo ID. Wishing you a happy journey.\n— {{agency_name}}, {{agency_phone}}' },
  { key: 'driver_details', name: 'Driver details', purpose: 'Share the driver and vehicle',
    subject: 'Your driver for {{trip_name}}',
    body: 'Namaste {{customer_name}} Ji,\nYour driver is Shri {{driver_name}} ({{driver_phone}}), vehicle {{vehicle_number}}.\n— {{agency_name}}, {{agency_phone}}' },
  { key: 'document_request', name: 'Document request', purpose: 'Ask for a document before travel',
    subject: 'Document needed for {{trip_name}}',
    body: 'Namaste {{customer_name}} Ji,\nFor {{trip_name}} we still need the {{document_needed}} for {{traveller_name}}. Kindly share it at your convenience.\n— {{agency_name}}, {{agency_phone}}' },
  { key: 'passport_expiry', name: 'Passport expiry', purpose: 'Warn that a passport lapses too soon',
    subject: 'Passport validity — {{traveller_name}}',
    body: 'Namaste {{customer_name}} Ji,\nThe passport of {{traveller_name}} is valid until {{passport_expiry}}. Many countries need six months of validity from travel, so please renew it before {{trip_name}}.\n— {{agency_name}}, {{agency_phone}}' },
  { key: 'feedback_request', name: 'Feedback request', purpose: 'Ask for feedback after the trip',
    subject: 'How was {{trip_name}}?',
    body: 'Namaste {{customer_name}} Ji,\nWelcome back from {{trip_name}}. We would be grateful for a minute of your feedback: {{portal_link}}\n— {{agency_name}}, {{agency_phone}}' },
];

/** Placeholder keys in the order they first appear — also Meta's parameter order. */
export function placeholdersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) {
    const k = m[1].toLowerCase();
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

/** Placeholders a template uses that TravelOS cannot fill. Empty means the template is usable. */
export function unknownPlaceholders(...texts: (string | null | undefined)[]): string[] {
  return [...new Set(texts.flatMap(t => placeholdersIn(t ?? '')))].filter(k => !PLACEHOLDER_KEYS.has(k));
}

export interface Rendered { subject: string | null; text: string; missing: string[]; params: string[] }

/**
 * Fills a template. Anything without a value is listed in `missing`, and the
 * caller must not send while it is non-empty — a customer never receives a
 * blank or a raw {{placeholder}}.
 */
export function renderTemplate(t: { subject?: string | null; body: string }, values: Record<string, string | number | null | undefined>): Rendered {
  const missing = new Set<string>();
  const fill = (text: string) => text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (whole, raw: string) => {
    const k = raw.toLowerCase();
    const v = values[k];
    if (v === null || v === undefined || String(v).trim() === '') { missing.add(k); return whole; }
    return String(v);
  });
  const text = fill(t.body);
  const subject = t.subject ? fill(t.subject) : null;
  const params = placeholdersIn(t.body).map(k => (values[k] === null || values[k] === undefined ? '' : String(values[k])));
  return { subject, text, missing: [...missing], params };
}
