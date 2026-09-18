import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from '@/shared/hooks/useToast';

interface Props {
  /** Masked value from the API (XXXX-XXXX-1234), or null. */
  masked: string | null | undefined;
  /** Calls the audited reveal endpoint. */
  reveal: () => Promise<{ value: string }>;
  /** Seconds the full value stays on screen. */
  seconds?: number;
}

/**
 * Identity numbers are shown masked. "Show" fetches the full value from an
 * audited endpoint and hides it again after a short time (hard rule 7).
 */
export function RevealableId({ masked, reveal, seconds = 30 }: Props) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!value) return;
    const t = setTimeout(() => setValue(null), seconds * 1000);
    return () => clearTimeout(t);
  }, [value, seconds]);

  if (!masked) return null;

  async function onClick() {
    if (value) { setValue(null); return; }
    setBusy(true);
    try { setValue((await reveal()).value); }
    catch (e) { toast.error('Could not show the number', (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono tabular-nums">{value ?? masked}</span>
      <button type="button" onClick={onClick} disabled={busy}
        className="inline-flex items-center gap-0.5 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
        title={value ? 'Hide' : 'Show the full number (this is logged)'}>
        {value ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}{value ? 'Hide' : 'Show'}
      </button>
    </span>
  );
}
