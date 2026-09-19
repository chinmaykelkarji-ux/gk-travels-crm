import { useParams } from 'react-router-dom';
import { itineraryAsText } from '@/shared/calc/itinerary';
import { toast } from '@/shared/hooks/useToast';
import type { ApiError } from '@/lib/api';
import { useCustomerItinerary } from '../hooks';
import { CustomerItineraryDocument } from '../components/CustomerItineraryDocument';

/** Standalone customer copy (print / save as PDF). Only the customer view is fetched. */
export default function ItineraryPrintPage() {
  const { id } = useParams<{ id: string }>();
  const q = useCustomerItinerary(id);
  if (q.isPending) return <div className="print-page-root" style={{ padding: 40, textAlign: 'center' }}><p className="text-sm text-gray-500">Loading itinerary…</p></div>;
  if (q.isError) return <div className="print-page-root" style={{ padding: 40, textAlign: 'center' }}><p className="text-sm text-gray-500 mb-4">{(q.error as ApiError).message}</p><button className="btn-back" onClick={() => window.close()}>Close</button></div>;
  const c = q.data;
  async function copy() {
    try { await navigator.clipboard.writeText(itineraryAsText(c)); toast.success('Copied', 'Paste it into WhatsApp.'); }
    catch (e) { toast.error('Could not copy', (e as Error).message); }
  }
  return (
    <div className="print-page-root">
      <div className="print-action-bar no-print">
        <button className="btn-back" onClick={() => window.close()}>Close</button>
        <div className="print-action-center">Itinerary {c.id} · version {c.version}</div>
        <div className="print-action-right">
          <button className="btn-whatsapp" onClick={() => void copy()}>Copy WhatsApp text</button>
          <button className="btn-print" style={{ background: '#C9A227', color: '#1B2A4A' }} onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </div>
      <div className="print-document"><CustomerItineraryDocument c={c} /></div>
    </div>
  );
}
