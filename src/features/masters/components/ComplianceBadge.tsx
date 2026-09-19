import { StatusPill, type Tone } from '@/design-system';
import type { ComplianceReport, ComplianceState } from '@/shared/calc/compliance';
import { fmtDate } from '@/shared/utils/date';

const TONE: Record<ComplianceState, Tone> = { OK: 'success', EXPIRING: 'warning', EXPIRED: 'danger', MISSING: 'neutral' };
const LABEL: Record<ComplianceState, string> = { OK: 'papers ok', EXPIRING: 'expiring', EXPIRED: 'expired', MISSING: 'missing' };

export function ComplianceBadge({ report }: { report: ComplianceReport }) {
  const detail = report.items.filter(i => i.state !== 'OK').map(i => `${i.document}: ${i.state === 'MISSING' ? 'not on file' : `${i.state.toLowerCase()} ${fmtDate(i.expiry)}`}`).join(' · ');
  return <span title={detail || 'All documents valid'}><StatusPill tone={TONE[report.state]}>{LABEL[report.state]}</StatusPill></span>;
}

export function ComplianceDetail({ report }: { report: ComplianceReport }) {
  return (
    <ul className="text-xs space-y-0.5">
      {report.items.map(i => (
        <li key={i.document} className="flex items-center gap-2">
          <span className="w-20 capitalize text-slate-500">{i.document}</span>
          <span className={i.state === 'EXPIRED' ? 'text-red-600' : i.state === 'EXPIRING' ? 'text-amber-700' : 'text-slate-700'}>{i.expiry ? fmtDate(i.expiry) : 'not on file'}</span>
        </li>
      ))}
    </ul>
  );
}
