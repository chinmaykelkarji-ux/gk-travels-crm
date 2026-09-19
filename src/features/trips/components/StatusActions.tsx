import { useState } from 'react';
import { Drawer, Field, TextInput, StatusPill, type Tone } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';

export const OPS_TONE: Record<string, Tone> = { REQUESTED: 'info', ON_HOLD: 'neutral', CONFIRMED: 'success', COMPLETED: 'success', CANCELLED: 'danger' };
export function OpsPill({ status }: { status: string }) {
  return <StatusPill tone={OPS_TONE[status] ?? 'neutral'}>{status.toLowerCase().replace('_', ' ')}</StatusPill>;
}

type Change = { status: string; confirmationNo?: string | null; reason?: string | null };
interface Props { status: string; kind: 'ops' | 'duty'; confirmationNo?: string | null; onChange: (c: Change) => Promise<unknown>; disabled?: boolean }

const NEXT: Record<'ops' | 'duty', Record<string, { to: string; label: string }[]>> = {
  ops: { REQUESTED: [{ to: 'CONFIRMED', label: 'Confirm' }, { to: 'ON_HOLD', label: 'Hold' }, { to: 'CANCELLED', label: 'Cancel' }], ON_HOLD: [{ to: 'CONFIRMED', label: 'Confirm' }, { to: 'REQUESTED', label: 'Back to requested' }, { to: 'CANCELLED', label: 'Cancel' }], CONFIRMED: [{ to: 'REQUESTED', label: 'Needs re-confirming' }, { to: 'CANCELLED', label: 'Cancel' }], CANCELLED: [{ to: 'REQUESTED', label: 'Reinstate' }] },
  duty: { REQUESTED: [{ to: 'CONFIRMED', label: 'Confirm' }, { to: 'CANCELLED', label: 'Cancel' }], CONFIRMED: [{ to: 'COMPLETED', label: 'Mark done' }, { to: 'REQUESTED', label: 'Needs re-confirming' }, { to: 'CANCELLED', label: 'Cancel' }], COMPLETED: [{ to: 'CONFIRMED', label: 'Reopen' }], CANCELLED: [{ to: 'REQUESTED', label: 'Reinstate' }] },
};

/** Status buttons for a booking row; confirming asks for the confirmation number, cancelling for a reason. */
export function StatusActions({ status, kind, confirmationNo, onChange, disabled }: Props) {
  const [ask, setAsk] = useState<{ to: string; label: string } | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(c: Change) {
    setBusy(true);
    try { await onChange(c); setAsk(null); setValue(''); toast.success('Status updated'); }
    catch (e) { toast.error('Not updated', (e as ApiError).summary ?? (e as Error).message); }
    finally { setBusy(false); }
  }
  function click(n: { to: string; label: string }) {
    if (n.to === 'CANCELLED' || (n.to === 'CONFIRMED' && kind === 'ops' && !confirmationNo)) { setValue(''); setAsk(n); return; }
    void run({ status: n.to });
  }
  if (disabled) return null;
  return (
    <>
      <div className="flex flex-wrap gap-1">{(NEXT[kind][status] ?? []).map(n => (
        <button key={n.to} type="button" disabled={busy} onClick={() => click(n)} className={`text-xs px-2 py-0.5 rounded border ${n.to === 'CANCELLED' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>{n.label}</button>
      ))}</div>
      <Drawer open={!!ask} onOpenChange={o => !o && setAsk(null)} width="md" title={ask?.to === 'CANCELLED' ? 'Why is it cancelled?' : 'Confirmation number'}
        footer={<><Button variant="outline" onClick={() => setAsk(null)}>Back</Button><Button disabled={!value.trim()} loading={busy} onClick={() => void run(ask!.to === 'CANCELLED' ? { status: 'CANCELLED', reason: value } : { status: ask!.to, confirmationNo: value })}>{ask?.label}</Button></>}>
        <Field label={ask?.to === 'CANCELLED' ? 'Reason' : 'Confirmation no. (or who confirmed it)'} htmlFor="sa-v" required>
          <TextInput id="sa-v" autoFocus value={value} onChange={e => setValue(e.target.value)} />
        </Field>
      </Drawer>
    </>
  );
}
