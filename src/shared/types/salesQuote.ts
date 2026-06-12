// ============================================================
// Sales Pipeline — Enquiry -> SalesQuote -> Confirmed Trip
// (named "SalesQuote" to avoid colliding with the existing GST
// Quotation/QuotationItem feature)
// ============================================================

export type EnquiryStatus = 'NEW' | 'IN_PROGRESS' | 'QUOTED' | 'NEGOTIATING' | 'WON' | 'LOST';

export type EnquirySource = 'DIRECT' | 'WHATSAPP' | 'PHONE' | 'EMAIL' | 'REFERRAL' | 'WEBSITE';

export type SalesQuoteStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'NEGOTIATING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export type SalesQuoteServiceType = 'FLIGHT' | 'HOTEL' | 'VEHICLE' | 'ACTIVITY' | 'TRANSFER';

export interface Enquiry {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  source: EnquirySource;
  destination: string;
  departureDate: string | null;
  returnDate: string | null;
  pax: number;
  requirements: string | null;
  budget: number | null;
  status: EnquiryStatus;
  assignedTo: string | null;
  notes: string | null;
  quotationCount: number;
  createdAt: string;
}

export interface EnquiryDetail extends Enquiry {
  customer: { id: string; name: string; phone: string; email: string | null; address: string | null };
  quotations: { id: string; quoteNumber: string; status: SalesQuoteStatus; totalAmount: number; createdAt: string }[];
}

export interface SalesQuoteLineItem {
  id: string;
  serviceType: SalesQuoteServiceType;
  description: string;
  supplierId: string | null;
  supplierName: string | null;
  costPrice: number;
  markup: number;
  sellPrice: number;
  quantity: number;
  unit: string;
  details: Record<string, unknown>;
  sortOrder: number;
  lineTotal: number;
}

export interface SalesQuote {
  id: string;
  enquiryId: string;
  quoteNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  destination: string;
  status: SalesQuoteStatus;
  validUntil: string;
  lineItems: SalesQuoteLineItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  notes: string | null;
  termsConditions: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  convertedAt: string | null;
  convertedTripId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesQuotePdfData {
  quote: SalesQuote;
  customer: { name: string; phone: string; email: string | null; address: string | null };
  agency: { name: string; address: string; phone: string; email: string; gstin: string };
}
