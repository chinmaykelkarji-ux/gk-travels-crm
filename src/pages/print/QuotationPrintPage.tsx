import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import apiClient from '@/lib/apiClient';
import { useStore } from '@/store';
import { QuotationPrintView } from '@/shared/components/documents/QuotationPrintView';
import { fmtDate } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import { toast } from '@/shared/hooks/useToast';
import type { EnquiryDetail, SalesQuotePdfData } from '@/shared/types/salesQuote';

function waHref(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const intl = digits.startsWith('91') ? digits : `91${digits}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

export default function QuotationPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const companySettings = useStore(s => s.companySettings);
  const fetchAll         = useStore(s => s.fetchAll);

  const [data, setData]       = useState<SalesQuotePdfData | null>(null);
  const [enquiry, setEnquiry] = useState<EnquiryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!id) return;
    apiClient.get<SalesQuotePdfData>(`/sales-quotes/${id}/pdf-data`)
      .then(res => {
        setData(res.data);
        if (res.data.quote.enquiryId) {
          apiClient.get<EnquiryDetail>(`/enquiries/${res.data.quote.enquiryId}`)
            .then(r => setEnquiry(r.data))
            .catch(() => {});
        }
      })
      .catch(() => { setError(true); toast.error('Failed to load quotation'); })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (searchParams.get('autoprint') === '1' && data) {
      const t = setTimeout(() => window.print(), 800);
      return () => clearTimeout(t);
    }
  }, [searchParams, data]);

  if (loading) {
    return (
      <div className="print-page-root flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <p className="text-sm text-gray-500">Loading quotation…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="print-page-root" style={{ padding: 40, textAlign: 'center' }}>
        <p className="text-sm text-gray-500 mb-4">Quotation not found.</p>
        <button className="btn-back" onClick={() => window.close()}>Close</button>
      </div>
    );
  }

  const whatsappMessage = `Dear ${data.quote.customerName}, your travel quotation ${data.quote.quoteNumber} for ${data.quote.destination} is ready! Package: ${formatCurrency(data.quote.totalAmount)} | Valid till: ${fmtDate(data.quote.validUntil)}. To confirm your booking, reply YES or call: ${data.agency.phone}`;

  return (
    <div className="print-page-root">
      <div className="print-action-bar no-print">
        <button className="btn-back" onClick={() => window.close()}>Close</button>
        <div className="print-action-center">Quotation {data.quote.quoteNumber}</div>
        <div className="print-action-right">
          <button className="btn-print" onClick={() => window.print()}>Print</button>
          <button className="btn-pdf" onClick={() => window.print()}>Download PDF</button>
          {data.customer.phone && (
            <a className="btn-whatsapp" href={waHref(data.customer.phone, whatsappMessage)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          )}
        </div>
      </div>
      <div className="print-document">
        <QuotationPrintView data={data} enquiry={enquiry} companySettings={companySettings} />
      </div>
    </div>
  );
}
