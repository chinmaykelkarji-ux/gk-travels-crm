import { cn } from '@/shared/utils/cn';

interface RecordNumberBadgeProps {
  label: 'Customer' | 'Trip';
  n: number | null | undefined;
  className?: string;
}

/**
 * "Customer #N" / "Trip #N" tag shown alongside an entity's existing
 * CUS-/GK- ID code. Renders nothing until the DB-assigned sequential
 * number arrives (briefly absent on a freshly created, optimistic record).
 */
export function RecordNumberBadge({ label, n, className }: RecordNumberBadgeProps) {
  if (n === null || n === undefined) return null;
  return (
    <span className={cn('text-[10px] font-mono text-gray-400', className)}>
      {label} #{n}
    </span>
  );
}
