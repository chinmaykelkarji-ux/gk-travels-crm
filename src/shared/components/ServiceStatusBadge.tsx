import { cn } from '@/shared/utils/cn';
import type { ServiceStatus } from '@/shared/types/operations';

const STATUS_STYLES: Record<ServiceStatus, string> = {
  DRAFT:            'bg-gray-100 text-gray-600',
  REQUESTED:        'bg-amber-100 text-amber-700',
  CONFIRMED:        'bg-emerald-100 text-emerald-700',
  VOUCHER_RECEIVED: 'bg-blue-100 text-blue-700',
  CANCELLED:        'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<ServiceStatus, string> = {
  DRAFT:            'Draft',
  REQUESTED:        'Requested',
  CONFIRMED:        'Confirmed',
  VOUCHER_RECEIVED: 'Voucher received',
  CANCELLED:        'Cancelled',
};

interface ServiceStatusBadgeProps {
  status: ServiceStatus;
}

export function ServiceStatusBadge({ status }: ServiceStatusBadgeProps) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_STYLES[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}
