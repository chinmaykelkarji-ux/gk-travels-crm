import { fmtDate, daysUntil } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import { DocumentHeader } from './DocumentHeader';
import { DocumentFooter } from './DocumentFooter';
import { DOC_COLORS } from './theme';
import type { CompanySettings } from '@/shared/types';
import type { EnquiryDetail, SalesQuotePdfData } from '@/shared/types/salesQuote';

const SERVICE_TYPE_PILL: Record<string, { bg: string; color: string }> = {
  FLIGHT:   { bg: '#DBEAFE', color: '#1D4ED8' },
  HOTEL:    { bg: '#D1FAE5', color: '#047857' },
  VEHICLE:  { bg: '#FEF3C7', color: '#B45309' },
  ACTIVITY: { bg: '#EDE9FE', color: '#6D28D9' },
  TRANSFER: { bg: '#FEF3C7', color: '#B45309' },
};

const DEFAULT_TERMS = [
  'Availability is subject to change until full payment is received.',
  '50% advance payment is required to confirm the booking.',
  'Balance payment must be cleared 7 days before departure.',
  'Cancellation charges apply as per policy.',
  'Prices are inclusive of applicable GST.',
];

export function extractPaymentSplit(terms: string | null): { advance: number; balance: number } {
  if (terms) {
    const matches = terms.match(/(\d{1,3})\s*%/g);
    if (matches && matches.length >= 2) {
      const advance = parseInt(matches[0], 10);
      const balance = parseInt(matches[1], 10);
      if (advance + balance === 100) return { advance, balance };
    }
  }
  return { advance: 50, balance: 50 };
}

interface QuotationPrintViewProps {
  data: SalesQuotePdfData;
  enquiry?: EnquiryDetail | null;
  companySettings?: CompanySettings | null;
}

export function QuotationPrintView({ data, enquiry, companySettings }: QuotationPrintViewProps) {
  const daysLeft = daysUntil(data.quote.validUntil);
  const expired = daysLeft !== null && daysLeft < 0;
  const expiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;
  const validUntilColor = expired ? '#DC2626' : expiringSoon ? '#D97706' : DOC_COLORS.textDark;

  return (
    <div style={{ fontFamily: 'sans-serif', color: DOC_COLORS.textDark, fontSize: 12 }}>
      <DocumentHeader companySettings={companySettings} documentLabel="Travel Quotation" />

      {/* Quote info + Prepared For */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Quote No.</div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: DOC_COLORS.primary }}>{data.quote.quoteNumber}</div>
          <div style={{ fontSize: 12, color: DOC_COLORS.textMedium, marginTop: 6 }}>Date: {fmtDate(data.quote.createdAt)}</div>
          <div style={{ fontSize: 12, marginTop: 2, fontWeight: expired || expiringSoon ? 700 : 400, color: validUntilColor }}>
            Valid Until: {fmtDate(data.quote.validUntil)}{expired ? ' (Expired)' : expiringSoon ? ' (Expiring soon)' : ''}
          </div>
        </div>
        <div style={{ background: DOC_COLORS.primaryLight, border: `1px solid ${DOC_COLORS.border}`, borderRadius: 6, padding: '12px 16px', minWidth: 220, textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Prepared For</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{data.customer.name}</div>
          {data.customer.phone && <div style={{ fontSize: 12, color: DOC_COLORS.textMedium, marginTop: 2 }}>{data.customer.phone}</div>}
          {data.customer.email && <div style={{ fontSize: 12, color: DOC_COLORS.textMedium, marginTop: 2 }}>{data.customer.email}</div>}
          {data.customer.address && <div style={{ fontSize: 12, color: DOC_COLORS.textMedium, marginTop: 2 }}>{data.customer.address}</div>}
        </div>
      </div>

      {/* Destination highlight */}
      <div style={{ background: DOC_COLORS.primary, color: '#fff', padding: '10px 16px', borderRadius: 6, marginBottom: 16, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>✈️ {data.quote.destination}</span>
        {enquiry?.departureDate && enquiry?.returnDate && (
          <>
            <span>|</span>
            <span>{fmtDate(enquiry.departureDate)} → {fmtDate(enquiry.returnDate)}</span>
          </>
        )}
        {enquiry?.pax !== undefined && (
          <>
            <span>|</span>
            <span>{enquiry.pax} Traveller{enquiry.pax !== 1 ? 's' : ''}</span>
          </>
        )}
      </div>

      {/* Package inclusions */}
      <div className="page-break-avoid" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `2px solid ${DOC_COLORS.primary}`, paddingBottom: 6, marginBottom: 8 }}>
          Package Inclusions
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: DOC_COLORS.primary, color: '#fff' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>#</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>Service</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>Description</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>Duration/Qty</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, fontSize: 11 }}>Price (₹)</th>
            </tr>
          </thead>
          <tbody>
            {data.quote.lineItems.map((item, i) => (
              <tr key={item.id} style={{ background: i % 2 ? DOC_COLORS.primaryLight : '#fff', borderBottom: `1px solid ${DOC_COLORS.border}` }}>
                <td style={{ padding: '8px 10px' }}>{i + 1}</td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                    background: SERVICE_TYPE_PILL[item.serviceType]?.bg ?? '#F3F4F6',
                    color: SERVICE_TYPE_PILL[item.serviceType]?.color ?? '#4B5563',
                  }}>
                    {item.serviceType}
                  </span>
                </td>
                <td style={{ padding: '8px 10px' }}>{item.description}</td>
                <td style={{ padding: '8px 10px' }}>{item.quantity} {item.unit}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pricing summary */}
      <div className="page-break-avoid" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div style={{ width: 280 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', color: DOC_COLORS.textMedium }}>
            <span>Package Price</span><span>{formatCurrency(data.quote.subtotal)}</span>
          </div>
          {data.quote.discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', color: DOC_COLORS.textMedium }}>
              <span>Discount</span><span>-{formatCurrency(data.quote.discountAmount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: DOC_COLORS.primary, borderTop: `2px solid ${DOC_COLORS.primary}`, padding: '8px 0', marginTop: 4 }}>
            <span>TOTAL PACKAGE PRICE</span><span>{formatCurrency(data.quote.totalAmount)}</span>
          </div>
          {enquiry?.pax ? (
            <div style={{ textAlign: 'right', fontSize: 11, color: DOC_COLORS.textLight, marginTop: 4 }}>
              {formatCurrency(Math.round(data.quote.totalAmount / enquiry.pax))} per person
            </div>
          ) : null}
        </div>
      </div>

      {/* Payment schedule */}
      {(() => {
        const { advance, balance } = extractPaymentSplit(data.quote.termsConditions);
        return (
          <div className="page-break-avoid" style={{ background: DOC_COLORS.primaryLight, border: `1px solid ${DOC_COLORS.border}`, borderRadius: 6, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Payment Schedule</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
              <div><span style={{ fontWeight: 600 }}>On Confirmation:</span> {advance}% ({formatCurrency(Math.round(data.quote.totalAmount * advance / 100))})</div>
              <div><span style={{ fontWeight: 600 }}>Before Departure:</span> {balance}% ({formatCurrency(Math.round(data.quote.totalAmount * balance / 100))})</div>
            </div>
          </div>
        );
      })()}

      {/* Validity & terms */}
      <div className="page-break-avoid" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: validUntilColor, marginBottom: 8 }}>
          ⚠️ This quotation is valid until {fmtDate(data.quote.validUntil)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Terms &amp; Conditions</div>
        <ul style={{ fontSize: 11, color: DOC_COLORS.textMedium, paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
          {(data.quote.termsConditions ? data.quote.termsConditions.split('\n').filter(Boolean) : DEFAULT_TERMS).map((t, i) => (
            <li key={i}>{t.replace(/^[-•\d.]+\s*/, '')}</li>
          ))}
        </ul>
      </div>

      {/* Notes */}
      {data.quote.notes && (
        <div className="page-break-avoid" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Notes</div>
          <p style={{ fontSize: 12, color: DOC_COLORS.textMedium, whiteSpace: 'pre-wrap', margin: 0 }}>{data.quote.notes}</p>
        </div>
      )}

      {/* Acceptance section */}
      <div className="page-break-avoid" style={{ marginTop: 40, paddingTop: 20, borderTop: `1px dashed ${DOC_COLORS.primary}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Customer Acceptance</div>
            <div style={{ borderBottom: '1px solid #333', width: 200, height: 32, marginBottom: 8 }} />
            <div style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signature</div>
            <div style={{ fontSize: 12, marginTop: 16 }}>Name: ____________________</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>Date: ____________________</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>For GK Travels</div>
            <div style={{ borderBottom: '1px solid #333', width: 200, height: 32, marginBottom: 8 }} />
            <div style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signature</div>
            <div style={{ fontSize: 12, marginTop: 16 }}>Authorized Signatory</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>GK Travels, Belagavi</div>
          </div>
        </div>
      </div>

      <DocumentFooter companySettings={companySettings} generatedOn={fmtDate(new Date().toISOString())} />
    </div>
  );
}
