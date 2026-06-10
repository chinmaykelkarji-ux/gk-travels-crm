// ============================================================
// GK TRAVELS CRM — GST INVOICING UTILITIES
//
// Shared helpers for the Invoice / Credit Note / Debit Note
// modules: Indian financial-year labelling, GST state codes,
// CGST/SGST vs IGST splitting, and document number formatting.
//
// Reused by both server/src/services/financeService.ts and the
// frontend Invoice/CreditNote/DebitNote builders/print views —
// keep this module dependency-free (no React, no Prisma types).
// ============================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Financial Year ──────────────────────────────────────────
// Indian FY runs 1 April – 31 March. Label format: "2026-27".

export function getFinancialYear(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const year  = d.getFullYear();
  const month = d.getMonth(); // 0-indexed; Jan=0 ... Mar=2, Apr=3
  const startYear = month >= 3 ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYearShort}`;
}

// ─── GST State Codes ──────────────────────────────────────────
// First 2 digits of a GSTIN identify the registered state.

export const GST_STATE_CODES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '25', name: 'Daman and Diu' },
  { code: '26', name: 'Dadra and Nagar Haveli' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh (Old)' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh (New)' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
  { code: '99', name: 'Centre Jurisdiction' },
];

export function getStateCodeFromGstin(gstin?: string | null): string | null {
  if (!gstin || gstin.length < 2) return null;
  return gstin.slice(0, 2);
}

export function getStateNameByCode(code?: string | null): string | null {
  if (!code) return null;
  return GST_STATE_CODES.find(s => s.code === code)?.name ?? null;
}

// ─── GST Type (CGST+SGST vs IGST) ─────────────────────────────

export type GstSplitType = 'INTRA' | 'INTER';

/**
 * Determines whether a supply is intra-state (CGST+SGST) or inter-state
 * (IGST) by comparing the supplier's (company) state code against the
 * place-of-supply state code. Defaults to INTRA when either is unknown.
 */
export function determineGstType(
  companyStateCode?:    string | null,
  placeOfSupplyStateCode?: string | null,
): GstSplitType {
  if (!companyStateCode || !placeOfSupplyStateCode) return 'INTRA';
  return companyStateCode === placeOfSupplyStateCode ? 'INTRA' : 'INTER';
}

export interface GstSplit {
  taxableAmount:  number;
  cgstAmount:     number;
  sgstAmount:     number;
  igstAmount:     number;
  totalGstAmount: number;
  totalAmount:    number;
}

/**
 * Splits the GST on a taxable amount into CGST+SGST (intra-state) or
 * IGST (inter-state) at the given rate. The half-rate split is rounded
 * independently for CGST, with SGST taking the remainder so the two
 * always sum exactly to the total GST (avoids 0.005 rounding drift).
 */
export function splitGst(taxableAmount: number, gstRate: number, gstType: GstSplitType): GstSplit {
  const taxable  = round2(taxableAmount);
  const totalGst = round2(taxable * gstRate / 100);

  if (gstType === 'INTER') {
    return {
      taxableAmount:  taxable,
      cgstAmount:     0,
      sgstAmount:     0,
      igstAmount:     totalGst,
      totalGstAmount: totalGst,
      totalAmount:    round2(taxable + totalGst),
    };
  }

  const cgst = round2(totalGst / 2);
  const sgst = round2(totalGst - cgst);
  return {
    taxableAmount:  taxable,
    cgstAmount:     cgst,
    sgstAmount:     sgst,
    igstAmount:     0,
    totalGstAmount: round2(cgst + sgst),
    totalAmount:    round2(taxable + cgst + sgst),
  };
}

/** Sums a list of per-line GstSplit results into one invoice-level total. */
export function sumGstSplits(splits: GstSplit[]): GstSplit {
  return splits.reduce<GstSplit>((acc, s) => ({
    taxableAmount:  round2(acc.taxableAmount  + s.taxableAmount),
    cgstAmount:     round2(acc.cgstAmount     + s.cgstAmount),
    sgstAmount:     round2(acc.sgstAmount     + s.sgstAmount),
    igstAmount:     round2(acc.igstAmount     + s.igstAmount),
    totalGstAmount: round2(acc.totalGstAmount + s.totalGstAmount),
    totalAmount:    round2(acc.totalAmount    + s.totalAmount),
  }), { taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalGstAmount: 0, totalAmount: 0 });
}

// ─── Document Numbering ───────────────────────────────────────
// GK/2026-27/01, CN/2026-27/0001, DN/2026-27/0001

export function formatDocNumber(prefix: string, financialYear: string, seq: number, padLength: number): string {
  return `${prefix}/${financialYear}/${String(seq).padStart(padLength, '0')}`;
}

export const INVOICE_SEQ_PAD     = 2;
export const CREDIT_DEBIT_SEQ_PAD = 4;

// ─── Travel Service Types (for invoice line items) ────────────
// Default SAC (Services Accounting Code) suggestions — editable per line.

export const SERVICE_TYPE_OPTIONS: { value: string; label: string; sac: string }[] = [
  { value: 'flight',         label: 'Flight Booking',   sac: '9967' },
  { value: 'train',          label: 'Train Booking',    sac: '9967' },
  { value: 'bus',            label: 'Bus Booking',      sac: '9967' },
  { value: 'hotel',          label: 'Hotel Booking',    sac: '9963' },
  { value: 'cab',            label: 'Cab / Transfer',   sac: '9966' },
  { value: 'visa',           label: 'Visa Service',     sac: '9991' },
  { value: 'insurance',      label: 'Travel Insurance', sac: '9971' },
  { value: 'package',        label: 'Tour Package',     sac: '9985' },
  { value: 'service_charge', label: 'Service Charge',   sac: '9985' },
  { value: 'other',          label: 'Other',            sac: '9985' },
];
