import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useStore, selectors } from '@/store';
import { ItineraryPrintView } from '@/shared/components/documents/ItineraryPrintView';
import { fmtDate } from '@/shared/utils/date';

function waHref(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const intl = digits.startsWith('91') ? digits : `91${digits}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

export default function ItineraryPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const itinerary       = useStore(selectors.itineraryById(id ?? ''));
  const companySettings = useStore(s => s.companySettings);
  const fetchAll        = useStore(s => s.fetchAll);
  const dataLoading     = useStore(s => s.dataLoading);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (searchParams.get('autoprint') === '1' && itinerary) {
      const t = setTimeout(() => window.print(), 800);
      return () => clearTimeout(t);
    }
  }, [searchParams, itinerary]);

  if (dataLoading) {
    return (
      <div className="print-page-root flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <p className="text-sm text-gray-500">Loading itinerary…</p>
      </div>
    );
  }

  if (!itinerary) {
    return (
      <div className="print-page-root" style={{ padding: 40, textAlign: 'center' }}>
        <p className="text-sm text-gray-500 mb-4">Itinerary not found.</p>
        <button className="btn-back" onClick={() => window.close()}>Close</button>
      </div>
    );
  }

  const whatsappMessage = `Your itinerary for ${itinerary.destination} is ready! Trip: ${itinerary.id} | Dates: ${itinerary.startDate ? fmtDate(itinerary.startDate) : '—'} to ${itinerary.endDate ? fmtDate(itinerary.endDate) : '—'} | ${itinerary.pax} traveller(s). Contact GK Travels for any queries: ${companySettings?.phone ?? ''}`;

  return (
    <div className="print-page-root">
      <div className="print-action-bar no-print">
        <button className="btn-back" onClick={() => window.close()}>Close</button>
        <div className="print-action-center">Itinerary {itinerary.id}</div>
        <div className="print-action-right">
          <button className="btn-print" onClick={() => window.print()}>Print</button>
          <button className="btn-pdf" onClick={() => window.print()}>Download PDF</button>
          {itinerary.customerPhone && (
            <a className="btn-whatsapp" href={waHref(itinerary.customerPhone, whatsappMessage)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          )}
        </div>
      </div>
      <div className="print-document">
        <ItineraryPrintView itinerary={itinerary} companySettings={companySettings} />
      </div>
    </div>
  );
}
