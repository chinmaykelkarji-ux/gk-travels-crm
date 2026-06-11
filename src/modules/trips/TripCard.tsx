import { useNavigate } from 'react-router-dom';
import { MapPin, Calendar, Users, IndianRupee } from 'lucide-react';
import type { Trip } from '@/shared/types';
import { FINANCIAL_STATUS_CLASS, FINANCIAL_STATUS_LABEL, getFinancialStatus } from '@/shared/utils/finance';
import { formatCurrency } from '@/shared/utils/format';
import { fmtDate, daysUntil } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { Badge } from '@/shared/components/ui/badge';
import { RecordNumberBadge } from '@/shared/components/RecordNumberBadge';

const TRIP_STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'orange' }> = {
  draft:       { label: 'Draft',       variant: 'secondary'    },
  quotation:   { label: 'Quotation',   variant: 'warning'      },
  confirmed:   { label: 'Confirmed',   variant: 'success'      },
  in_progress: { label: 'In Progress', variant: 'default'      },
  completed:   { label: 'Completed',   variant: 'secondary'    },
  cancelled:   { label: 'Cancelled',   variant: 'destructive'  },
};

interface TripCardProps {
  trip: Trip;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function TripCard({ trip, selected, onToggleSelect }: TripCardProps) {
  const navigate  = useNavigate();
  const days      = daysUntil(trip.departure);
  const finStatus = getFinancialStatus(trip.totalPayable, trip.paidAmount);

  const borderClass =
    days !== null && days >= 0 && days <= 1  ? 'border-red-300'    :
    days !== null && days >= 0 && days <= 7  ? 'border-yellow-300' :
    'border-gray-200';

  const statusConfig = TRIP_STATUS_BADGE[trip.status] ?? { label: trip.status, variant: 'secondary' as const };

  return (
    <div
      className={cn(
        'bg-white rounded-xl border shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 overflow-hidden',
        borderClass
      )}
      onClick={() => navigate(`/trips/${trip.id}`)}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between mb-1.5">
          <div className="flex items-center gap-2">
            {onToggleSelect && (
              <input
                type="checkbox"
                checked={!!selected}
                onChange={() => onToggleSelect(trip.id)}
                onClick={e => e.stopPropagation()}
                className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                aria-label={`Select trip ${trip.id}`}
              />
            )}
            <span className="text-[10px] font-mono font-medium text-gray-400 tracking-wider">
              {trip.id}
              <RecordNumberBadge label="Trip" n={trip.tripNumber} className="ml-1.5" />
            </span>
          </div>
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        </div>
        <h3 className="text-sm font-bold text-gray-900">{trip.customer}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{trip.type} · {trip.pax} pax</p>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="font-medium truncate">{trip.destination}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <span>{trip.departure ? fmtDate(trip.departure) : 'No date set'}</span>
          </div>
          {days !== null && (
            <span className={cn(
              'text-[11px] font-semibold',
              days === 0 ? 'text-red-600' :
              days <= 1  ? 'text-red-500' :
              days <= 7  ? 'text-yellow-600' :
              days < 0   ? 'text-gray-400' :
              'text-blue-600'
            )}>
              {days < 0 ? 'Departed' : days === 0 ? 'Today' : `${days}d`}
            </span>
          )}
        </div>
      </div>

      {/* Finance Footer */}
      <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        {trip.totalPayable === null ? (
          <span className="text-xs text-yellow-700 font-medium">⚠ Price Not Set</span>
        ) : (
          <div className="flex items-center gap-1 text-xs">
            <IndianRupee className="w-3 h-3 text-gray-400" />
            <span className="font-semibold text-gray-800">{formatCurrency(trip.totalPayable)}</span>
          </div>
        )}
        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', FINANCIAL_STATUS_CLASS[finStatus])}>
          {FINANCIAL_STATUS_LABEL[finStatus]}
        </span>
      </div>
    </div>
  );
}
