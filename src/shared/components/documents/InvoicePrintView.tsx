import { fmtDate } from '@/shared/utils/date';
import { formatCurrency, amountInWordsRupees, hsnSacForServiceType } from '@/shared/utils/format';
import { DocumentHeader } from './DocumentHeader';
import { DocumentFooter } from './DocumentFooter';
import { DOC_COLORS } from './theme';
import type { Invoice, CompanySettings, Trip, Receivable, Customer } from '@/shared/types';

const SERVICE_TYPE_PILL: Record<string, { bg: string; color: string }> = {
  FLIGHT:    { bg: '#DBEAFE', color: '#1D4ED8' },
  HOTEL:     { bg: '#D1FAE5', color: '#047857' },
  VEHICLE:   { bg: '#FEF3C7', color: '#B45309' },
  ACTIVITY:  { bg: '#EDE9FE', color: '#6D28D9' },
  TRANSFER:  { bg: '#FEF3C7', color: '#B45309' },
  INSURANCE: { bg: '#F3F4F6', color: '#4B5563' },
};

interface InvoicePrintViewProps {
  invoice: Invoice;
  companySettings?: CompanySettings | null;
  linkedTrip?: Trip;
  receivable?: Receivable;
  customer?: Customer;
}

export function InvoicePrintView({ invoice, companySettings, linkedTrip, receivable, customer }: InvoicePrintViewProps) {
  return (
    <div style={{ fontFamily: 'sans-serif', color: DOC_COLORS.textDark, fontSize: 12 }}>
      <DocumentHeader companySettings={companySettings} documentLabel="Tax Invoice" />

      {/* Invoice info + Bill To */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Tax Invoice</div>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>{invoice.invoiceNumber}</div>
          <div style={{ fontSize: 11, color: DOC_COLORS.textMedium, marginTop: 4 }}>Invoice Date: {fmtDate(invoice.invoiceDate)}</div>
          {invoice.dueDate && <div style={{ fontSize: 11, color: DOC_COLORS.textMedium }}>Due Date: {fmtDate(invoice.dueDate)}</div>}
        </div>
        <div style={{ border: `1px solid ${DOC_COLORS.border}`, borderRadius: 8, padding: 12, minWidth: 220 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Bill To</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{invoice.customerName}</div>
          {(customer?.phone || customer?.email) && (
            <div style={{ fontSize: 11, color: DOC_COLORS.textMedium, marginTop: 2 }}>
              {customer?.phone && <div>{customer.phone}</div>}
              {customer?.email && <div>{customer.email}</div>}
            </div>
          )}
          {invoice.customerAddress && <div style={{ fontSize: 11, color: DOC_COLORS.textMedium, marginTop: 2, whiteSpace: 'pre-wrap' }}>{invoice.customerAddress}</div>}
          {invoice.customerGstin && <div style={{ fontSize: 11, color: DOC_COLORS.textMedium, marginTop: 2 }}>GSTIN: {invoice.customerGstin}</div>}
        </div>
      </div>

      {/* Trip reference box */}
      {linkedTrip && (
        <div className="page-break-avoid" style={{ background: DOC_COLORS.primaryLight, borderRadius: 6, padding: '8px 14px', marginBottom: 16, fontSize: 11, color: DOC_COLORS.textDark, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <span><strong>Trip:</strong> {linkedTrip.id}</span>
          <span><strong>Destination:</strong> {linkedTrip.destination}</span>
          <span><strong>Travel Date:</strong> {linkedTrip.departure ? fmtDate(linkedTrip.departure) : '—'}</span>
          <span><strong>Pax:</strong> {linkedTrip.pax}</span>
          {linkedTrip.departure && linkedTrip.returnDate && (
            <span><strong>Duration:</strong> {Math.max(1, Math.round((new Date(linkedTrip.returnDate).getTime() - new Date(linkedTrip.departure).getTime()) / 86400000))} nights</span>
          )}
        </div>
      )}

      {/* Items table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <thead>
          <tr style={{ background: DOC_COLORS.primary, color: DOC_COLORS.white }}>
            {['#', 'Description', 'HSN/SAC', 'Qty', 'Unit', 'Rate (₹)', 'Amount (₹)'].map(h => (
              <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, padding: '8px 10px', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it, idx) => (
            <tr key={it.id} className="page-break-avoid" style={{ background: idx % 2 === 0 ? DOC_COLORS.white : DOC_COLORS.primaryLight, borderBottom: `1px solid ${DOC_COLORS.border}` }}>
              <td style={{ fontSize: 11, padding: '8px 10px', color: DOC_COLORS.textLight }}>{idx + 1}</td>
              <td style={{ fontSize: 12, padding: '8px 10px' }}>
                {it.description}
                {it.serviceType && (
                  <span style={{
                    marginLeft: 8, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, textTransform: 'uppercase',
                    background: SERVICE_TYPE_PILL[it.serviceType]?.bg ?? '#F3F4F6',
                    color: SERVICE_TYPE_PILL[it.serviceType]?.color ?? '#4B5563',
                  }}>
                    {it.serviceType}
                  </span>
                )}
              </td>
              <td style={{ fontSize: 11, padding: '8px 10px', fontFamily: 'monospace' }}>{it.hsnSac || hsnSacForServiceType(it.serviceType)}</td>
              <td style={{ fontSize: 12, padding: '8px 10px' }}>{it.quantity}</td>
              <td style={{ fontSize: 12, padding: '8px 10px' }}>—</td>
              <td style={{ fontSize: 12, padding: '8px 10px' }}>{formatCurrency(it.rate)}</td>
              <td style={{ fontSize: 12, padding: '8px 10px', fontWeight: 600 }}>{formatCurrency(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="page-break-avoid" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <table style={{ width: 300, fontSize: 12 }}>
          <tbody>
            <tr><td style={{ padding: '3px 0', color: DOC_COLORS.textMedium }}>Subtotal</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(invoice.taxableAmount)}</td></tr>
            <tr><td style={{ padding: '3px 0', color: DOC_COLORS.textMedium }}>Taxable Amount</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(invoice.taxableAmount)}</td></tr>
            {invoice.gstType === 'INTRA' ? (
              <>
                <tr><td style={{ padding: '3px 0', color: DOC_COLORS.textMedium }}>CGST @ 2.5%</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(invoice.cgstAmount)}</td></tr>
                <tr><td style={{ padding: '3px 0', color: DOC_COLORS.textMedium }}>SGST @ 2.5%</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(invoice.sgstAmount)}</td></tr>
              </>
            ) : (
              <tr><td style={{ padding: '3px 0', color: DOC_COLORS.textMedium }}>IGST @ 5%</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(invoice.igstAmount)}</td></tr>
            )}
            <tr style={{ borderTop: `2px solid ${DOC_COLORS.primary}` }}>
              <td style={{ padding: '6px 0', fontWeight: 700, fontSize: 15, color: DOC_COLORS.primary }}>TOTAL AMOUNT</td>
              <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, fontSize: 15, color: DOC_COLORS.primary }}>{formatCurrency(invoice.totalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="page-break-avoid" style={{ textAlign: 'right', fontSize: 11, fontStyle: 'italic', color: DOC_COLORS.textMedium, marginBottom: 16 }}>
        {amountInWordsRupees(invoice.totalAmount)}
      </p>

      {/* Payment status */}
      {receivable && (
        <div className="page-break-avoid" style={{ marginBottom: 16 }}>
          {receivable.balanceDue <= 0 ? (
            <div style={{ background: '#D1FAE5', color: '#047857', borderRadius: 6, padding: '8px 14px', fontSize: 12, fontWeight: 700 }}>
              ✅ PAID IN FULL
            </div>
          ) : receivable.totalReceived > 0 ? (
            <div style={{ background: '#FEF3C7', color: '#B45309', borderRadius: 6, padding: '8px 14px', fontSize: 12, fontWeight: 700 }}>
              ⚠️ PARTIALLY PAID — Balance Due: {formatCurrency(receivable.balanceDue)}
            </div>
          ) : (
            <div style={{ background: '#FEE2E2', color: '#B91C1C', borderRadius: 6, padding: '8px 14px', fontSize: 12, fontWeight: 700 }}>
              ❌ PAYMENT PENDING — Amount Due: {formatCurrency(receivable.balanceDue)}
            </div>
          )}

          {receivable.entries.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${DOC_COLORS.border}` }}>
                  {['Date', 'Mode', 'Amount', 'Reference'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: DOC_COLORS.textLight, fontWeight: 700, textTransform: 'uppercase', fontSize: 9 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {receivable.entries.map(e => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${DOC_COLORS.border}` }}>
                    <td style={{ padding: '4px 8px' }}>{fmtDate(e.paymentDate)}</td>
                    <td style={{ padding: '4px 8px' }}>{e.paymentMode}</td>
                    <td style={{ padding: '4px 8px' }}>{formatCurrency(e.amount)}</td>
                    <td style={{ padding: '4px 8px' }}>{e.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Bank details */}
      {(companySettings?.bankName || companySettings?.bankAccountNumber) && (
        <div className="page-break-avoid" style={{ border: `1px solid ${DOC_COLORS.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 11, color: DOC_COLORS.textMedium }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: DOC_COLORS.primary, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>Bank Details</div>
          {companySettings.bankName && <div>Bank: {companySettings.bankName}</div>}
          {companySettings.bankAccountName && <div>Account Name: {companySettings.bankAccountName}</div>}
          {companySettings.bankAccountNumber && <div>Account No: {companySettings.bankAccountNumber}</div>}
          {companySettings.bankIfsc && <div>IFSC: {companySettings.bankIfsc}</div>}
          {companySettings.bankBranch && <div>Branch: {companySettings.bankBranch}</div>}
        </div>
      )}

      {/* Terms */}
      {invoice.termsAndConds && (
        <div className="page-break-avoid" style={{ marginBottom: 16, fontSize: 11, color: DOC_COLORS.textMedium }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: DOC_COLORS.primary, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>Terms &amp; Conditions</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{invoice.termsAndConds}</div>
        </div>
      )}

      {/* Declaration + Signature */}
      <div className="page-break-avoid" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 24 }}>
        <div style={{ fontSize: 10, color: DOC_COLORS.textLight, maxWidth: 380 }}>
          We declare that this invoice shows the actual price of the services described and that all particulars are true and correct.
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>For {companySettings?.companyName || invoice.companyName || 'GK Travels'}</div>
          {companySettings?.signatureUrl && (
            <img src={companySettings.signatureUrl} alt="Signature" style={{ height: 50, marginBottom: 4 }} />
          )}
          <div style={{ borderTop: `1px solid ${DOC_COLORS.textDark}`, paddingTop: 4, fontSize: 11, minWidth: 160 }}>
            {companySettings?.authorizedSignatory || 'Authorized Signatory'}
          </div>
        </div>
      </div>

      <DocumentFooter companySettings={companySettings} generatedOn={fmtDate(new Date().toISOString())} />
    </div>
  );
}
