import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useStore, selectors } from '@/store';
import { InvoicePrintView } from '@/shared/components/documents/InvoicePrintView';
import { formatCurrency } from '@/shared/utils/format';

function waHref(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const intl = digits.startsWith('91') ? digits : `91${digits}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const invoice         = useStore(selectors.invoiceById(id ?? ''));
  const companySettings = useStore(s => s.companySettings);
  const linkedTrip      = useStore(s => invoice?.tripIds?.[0] ? s.trips.find(t => t.id === invoice.tripIds[0]) : undefined);
  const receivable      = useStore(s => s.receivables.find(r => r.invoiceId === invoice?.id));
  const customer        = useStore(s => invoice?.customerId ? s.customers.find(c => c.id === invoice.customerId) : undefined);
  const fetchAll        = useStore(s => s.fetchAll);
  const dataLoading     = useStore(s => s.dataLoading);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (searchParams.get('autoprint') === '1' && invoice) {
      const t = setTimeout(() => window.print(), 800);
      return () => clearTimeout(t);
    }
  }, [searchParams, invoice]);

  if (dataLoading) {
    return (
      <div className="print-page-root flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <p className="text-sm text-gray-500">Loading invoice…</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="print-page-root" style={{ padding: 40, textAlign: 'center' }}>
        <p className="text-sm text-gray-500 mb-4">Invoice not found.</p>
        <button className="btn-back" onClick={() => window.close()}>Close</button>
      </div>
    );
  }

  const phone = linkedTrip?.phone ?? customer?.phone ?? '';
  const whatsappMessage = `Dear ${invoice.customerName}, your invoice ${invoice.invoiceNumber} for ${linkedTrip?.destination ?? 'your'} trip is ready. Amount: ${formatCurrency(invoice.totalAmount)} | Due: ${formatCurrency(receivable?.balanceDue ?? invoice.totalAmount)}. Please contact GK Travels to make payment: ${companySettings?.phone ?? ''}`;

  return (
    <div className="print-page-root">
      <div className="print-action-bar no-print">
        <button className="btn-back" onClick={() => window.close()}>Close</button>
        <div className="print-action-center">Invoice {invoice.invoiceNumber}</div>
        <div className="print-action-right">
          <button className="btn-print" onClick={() => window.print()}>Print</button>
          <button className="btn-pdf" onClick={() => window.print()}>Download PDF</button>
          {phone && (
            <a className="btn-whatsapp" href={waHref(phone, whatsappMessage)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          )}
        </div>
      </div>
      <div className="print-document">
        <InvoicePrintView invoice={invoice} companySettings={companySettings} linkedTrip={linkedTrip} receivable={receivable} customer={customer} />
      </div>
    </div>
  );
}
