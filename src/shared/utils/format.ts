// ─── Currency ────────────────────────────────────────────────

const INR = new Intl.NumberFormat('en-IN', {
  style:                 'currency',
  currency:              'INR',
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return INR.format(amount);
}

export function formatCurrencyShort(amount: number): string {
  if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(1)}Cr`;
  if (amount >= 1_00_000)    return `₹${(amount / 1_00_000).toFixed(1)}L`;
  if (amount >= 1_000)       return `₹${(amount / 1_000).toFixed(1)}K`;
  return `₹${amount}`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

// ─── Phone ───────────────────────────────────────────────────

export function formatPhone(phone: string | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return phone;
}

// ─── Truncate ────────────────────────────────────────────────

export function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

// ─── Initials ────────────────────────────────────────────────

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

// ─── Percentage ──────────────────────────────────────────────

export function formatPct(pct: number): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

// ─── Amount in words (Indian numbering system) ────────────────

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o ? ` ${ONES[o]}` : ''}`;
}

function threeDigitsToWords(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 0) return twoDigitsToWords(rest);
  return `${ONES[h]} Hundred${rest ? ` ${twoDigitsToWords(rest)}` : ''}`;
}

/** Converts a rupee amount to words using the Indian numbering system
 *  (Crore/Lakh/Thousand), e.g. 218000 -> "Two Lakh Eighteen Thousand". */
export function amountInWords(amount: number): string {
  const rounded = Math.round(Math.abs(amount));
  if (rounded === 0) return 'Zero';

  const crore    = Math.floor(rounded / 1_00_00_000);
  const lakh     = Math.floor((rounded % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((rounded % 1_00_000) / 1_000);
  const hundred  = rounded % 1_000;

  const parts: string[] = [];
  if (crore)    parts.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh)     parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (hundred)  parts.push(threeDigitsToWords(hundred));

  return parts.join(' ');
}

/** Converts a rupee amount to the standard "Rupees ... Only" phrase used on
 *  invoices, e.g. 21800 -> "Rupees Twenty One Thousand Eight Hundred Only". */
export function amountInWordsRupees(amount: number): string {
  return `Rupees ${amountInWords(amount)} Only`;
}

// ─── HSN/SAC codes by service type ─────────────────────────────

const HSN_SAC_CODES: Record<string, string> = {
  FLIGHT:    '996321',
  HOTEL:     '996311',
  VEHICLE:   '996601',
  ACTIVITY:  '999691',
  TRANSFER:  '996601',
  INSURANCE: '997137',
};

export function hsnSacForServiceType(serviceType: string | null | undefined): string {
  if (!serviceType) return '998551';
  return HSN_SAC_CODES[serviceType.toUpperCase()] ?? '998551';
}
