import { StatusPill, type Tone } from '@/design-system';
import { daysUntilExpiry, passportStatus, type PassportStatus } from '@/shared/calc/travellers';
import { fmtDate } from '@/shared/utils/date';

const TONE: Record<PassportStatus, Tone> = { OK: 'success', EXPIRING: 'warning', INSUFFICIENT: 'warning', EXPIRED: 'danger', UNKNOWN: 'neutral' };
const LABEL: Record<PassportStatus, string> = { OK: 'valid', EXPIRING: 'expiring', INSUFFICIENT: '< 6 months at travel', EXPIRED: 'expired', UNKNOWN: 'no passport' };

/** Passport expiry with a status pill; pass travelDate to apply the six-month rule. */
export function PassportPill({ expiry, travelDate, status, showDate = true }: { expiry: string | null | undefined; travelDate?: string | null; status?: PassportStatus; showDate?: boolean }) {
  const s = status ?? passportStatus(expiry, { travelDate });
  const days = daysUntilExpiry(expiry);
  const label = s === 'EXPIRING' && days !== null ? `${days} days left` : LABEL[s];
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {showDate && expiry && <span className="tabular-nums">{fmtDate(expiry)}</span>}
      <StatusPill tone={TONE[s]}>{label}</StatusPill>
    </span>
  );
}
