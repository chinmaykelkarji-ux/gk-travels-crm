import { Ticket } from 'lucide-react';
import { useStore } from '@/store';
import { Badge } from '@/shared/components/ui/badge';
import { formatCurrency } from '@/shared/utils/format';
import { fmtDate } from '@/shared/utils/date';
import { FINANCIAL_STATUS_CLASS, FINANCIAL_STATUS_LABEL, getFinancialStatus } from '@/shared/utils/finance';
import { cn } from '@/shared/utils/cn';
import { EmptyState } from '@/shared/components/EmptyState';

const TYPE_BADGE: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'purple'> = {
  flight:    'default',
  hotel:     'success',
  visa:      'warning',
  insurance: 'secondary',
  train:     'purple',
  bus:       'secondary',
  cab:       'orange' as 'warning',
  activity:  'success',
};

export default function Bookings() {
  const bookings = useStore(s => s.bookings);

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold text-gray-900 font-display">Bookings</h2>
        <Badge variant="secondary">{bookings.length} total</Badge>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3.5">
        <p className="text-sm text-blue-700 font-medium">Bookings Module — Phase 2</p>
        <p className="text-xs text-blue-600 mt-1">
          Full bookings management with PNR search, supplier tracking, booking reconciliation,
          and multi-leg flight support is coming in Phase 2. Existing booking data is preserved.
        </p>
      </div>

      {bookings.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No bookings yet"
          description="Bookings linked to trips will appear here"
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Booking ID', 'Type', 'Customer', 'Trip', 'Selling Price', 'Balance', 'Status'].map(h => (
                    <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bookings.map(b => {
                  const finStatus = getFinancialStatus(b.totalPayable, b.advance);
                  return (
                    <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-[11px] text-gray-400">{b.id}</td>
                      <td className="px-4 py-3">
                        <Badge variant={TYPE_BADGE[b.type] ?? 'secondary'} className="capitalize">{b.type}</Badge>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{b.customerName}</td>
                      <td className="px-4 py-3 text-gray-500">{b.refId || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {b.totalPayable !== null ? formatCurrency(b.totalPayable) : (
                          <span className="text-yellow-700 text-xs">⚠ Not set</span>
                        )}
                      </td>
                      <td className={cn('px-4 py-3 font-medium', b.balanceDue > 0 ? 'text-red-600' : 'text-gray-400')}>
                        {formatCurrency(b.balanceDue)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', FINANCIAL_STATUS_CLASS[finStatus])}>
                          {FINANCIAL_STATUS_LABEL[finStatus]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
