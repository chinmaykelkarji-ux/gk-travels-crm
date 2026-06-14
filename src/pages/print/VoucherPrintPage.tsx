import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useStore, selectors } from '@/store';
import { VoucherPrintView, voucherSummary } from '@/shared/components/documents/VoucherPrintView';
import { VOUCHER_TYPES } from '@/modules/vouchers/Vouchers';

function waHref(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const intl = digits.startsWith('91') ? digits : `91${digits}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

export default function VoucherPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const voucher         = useStore(selectors.voucherById(id ?? ''));
  const companySettings = useStore(s => s.companySettings);
  const linkedTrip      = useStore(s => voucher?.tripId ? s.trips.find(t => t.id === voucher.tripId) : undefined);
  const fetchAll        = useStore(s => s.fetchAll);
  const dataLoading     = useStore(s => s.dataLoading);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (searchParams.get('autoprint') === '1' && voucher) {
      const t = setTimeout(() => window.print(), 800);
      return () => clearTimeout(t);
    }
  }, [searchParams, voucher]);

  if (dataLoading) {
    return (
      <div className="print-page-root flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <p className="text-sm text-gray-500">Loading voucher…</p>
      </div>
    );
  }

  if (!voucher) {
    return (
      <div className="print-page-root" style={{ padding: 40, textAlign: 'center' }}>
        <p className="text-sm text-gray-500 mb-4">Voucher not found.</p>
        <button className="btn-back" onClick={() => window.close()}>Close</button>
      </div>
    );
  }

  const typeMeta = VOUCHER_TYPES.find(t => t.value === voucher.type);
  const whatsappMessage = `Dear ${voucher.customerName}, your ${typeMeta?.label ?? voucher.type} voucher ${voucher.voucherNumber} is confirmed. ${voucherSummary(voucher)}. Keep this voucher handy during travel. - GK Travels`;

  return (
    <div className="print-page-root">
      <div className="print-action-bar no-print">
        <button className="btn-back" onClick={() => window.close()}>Close</button>
        <div className="print-action-center">Voucher {voucher.voucherNumber}</div>
        <div className="print-action-right">
          <button className="btn-print" onClick={() => window.print()}>Print</button>
          <button className="btn-pdf" onClick={() => window.print()}>Download PDF</button>
          {voucher.customerPhone && (
            <a className="btn-whatsapp" href={waHref(voucher.customerPhone, whatsappMessage)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          )}
        </div>
      </div>
      <div className="print-document">
        <VoucherPrintView voucher={voucher} companySettings={companySettings} linkedTrip={linkedTrip} />
      </div>
    </div>
  );
}
