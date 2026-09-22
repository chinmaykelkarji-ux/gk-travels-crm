import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ExternalLink, X } from 'lucide-react';
import { EmptyState, Field, Select, StatusPill, TextInput } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { documentsApi } from '@/features/documents/api';
import { DOCUMENT_TYPE_LABEL } from '@/shared/contracts/documents';
import { EXTRACTION_STATUS_LABEL } from '@/shared/contracts/extraction';
import { extractionApi, type Extraction, type MatchCandidate } from '../api';
import { useExtractionMutation } from '../hooks';

/** Which answered field each line of the proposal came from, so its confidence can be shown. */
const FROM_FIELD: Record<string, Record<string, string>> = {
  TICKET: { mode: 'mode', pnr: 'pnr', airline: 'airlineOrOperator', travelClass: 'travelClass', quota: 'quota', fare: 'fare' },
  HOTEL_BOOKING: { hotelName: 'hotelName', city: 'city', confirmationNo: 'confirmationNo', checkIn: 'checkIn', checkOut: 'checkOut', rooms: 'rooms', roomType: 'roomType', mealPlan: 'mealPlan', totalAmount: 'totalAmount' },
  VENDOR_BILL: { supplierName: 'supplierName', gstin: 'supplierGstin', billNumber: 'billNumber', billDate: 'billDate', dueDate: 'dueDate', description: 'description', taxableAmount: 'taxableAmount', gstAmount: 'gstAmount', totalAmount: 'totalAmount' },
};

const LABEL: Record<string, string> = {
  mode: 'Travel by', pnr: 'PNR', airline: 'Operator', travelClass: 'Class', quota: 'Quota', fare: 'Fare (₹)',
  hotelName: 'Hotel', city: 'City', confirmationNo: 'Confirmation no.', checkIn: 'Check-in', checkOut: 'Check-out',
  rooms: 'Rooms', roomType: 'Room type', mealPlan: 'Meal plan', totalAmount: 'Total (₹)',
  supplierName: 'Supplier', gstin: 'GSTIN', billNumber: 'Bill number', billDate: 'Bill date', dueDate: 'Due date',
  description: 'For', taxableAmount: 'Before tax (₹)', gstAmount: 'GST (₹)',
};

const DATE_FIELDS = new Set(['checkIn', 'checkOut', 'billDate', 'dueDate']);
const NUMBER_FIELDS = new Set(['fare', 'rooms', 'totalAmount', 'taxableAmount', 'gstAmount']);

interface AnsweredField { value: unknown; confidence: 'high' | 'medium' | 'low' }
const answered = (fields: Record<string, unknown> | null, key?: string): AnsweredField | null => {
  if (!fields || !key) return null;
  const f = fields[key] as AnsweredField | undefined;
  return f && typeof f === 'object' && 'confidence' in f ? f : null;
};

function ConfidencePill({ f }: { f: AnsweredField | null }) {
  if (!f) return null;
  if (f.value === null || f.value === '') return <StatusPill tone="warning">unable to confidently identify</StatusPill>;
  if (f.confidence === 'high') return null;
  return <StatusPill tone="warning">read as {f.confidence} — please check</StatusPill>;
}

function MatchChoice({ label, matches, value, onChange, emptyHint }: {
  label: string; matches: MatchCandidate[]; value: string | null; onChange: (v: string | null) => void; emptyHint: string;
}) {
  return (
    <Field label={label} htmlFor={`m-${label}`} hint={matches[0]?.why.length ? `Suggested because ${matches[0].why.join(', ')}` : emptyHint}>
      <Select id={`m-${label}`} value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
        <option value="">Not chosen</option>
        {matches.map(m => <option key={m.id} value={m.id}>{m.label} ({Math.round(m.score * 100)}% sure)</option>)}
        {value && !matches.some(m => m.id === value) && <option value={value}>{value}</option>}
      </Select>
    </Field>
  );
}

/** The document beside what was read from it, for a person to check and approve. */
export function ReviewPanel({ extraction, onDone }: { extraction: Extraction; onDone?: () => void }) {
  const proposal = (extraction.proposal ?? {}) as Record<string, unknown>;
  const kind = String(proposal.kind ?? '');
  const map = FROM_FIELD[kind] ?? {};
  const summary = proposal.summary as { total: number; read: number; toCheck: number; unreadable: string[] } | undefined;

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [tripId, setTripId] = useState<string | null>(extraction.tripId);
  const [vendorId, setVendorId] = useState<string | null>(extraction.vendorId);
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const approve = useExtractionMutation(() => extractionApi.approve(extraction.id, { values, tripId, vendorId, note: note || undefined }));
  const reject = useExtractionMutation(() => extractionApi.reject(extraction.id, reason));

  useEffect(() => {
    let alive = true;
    documentsApi.downloadUrl(extraction.documentId, true)
      .then(r => { if (alive) setPreview(r.url); })
      .catch(() => { /* the button still works */ });
    return () => { alive = false; };
  }, [extraction.documentId]);

  const current = useMemo(() => ({ ...proposal, ...values }), [proposal, values]);
  const set = (k: string, v: unknown) => setValues(prev => ({ ...prev, [k]: v }));

  if (extraction.status === 'FAILED') {
    return <EmptyState title="This one could not be read" description={extraction.error ?? 'No reason was recorded.'} />;
  }
  if (extraction.status === 'QUEUED' || extraction.status === 'READING') {
    return <p className="text-sm text-slate-500">{EXTRACTION_STATUS_LABEL[extraction.status]}… this takes a few seconds.</p>;
  }
  if (extraction.status === 'APPLIED') {
    return (
      <EmptyState title="Already saved"
        description={`This document was saved as ${extraction.appliedKind?.replace(/_/g, ' ')} ${extraction.appliedId}.`} />
    );
  }

  const rows = Object.keys(map).filter(k => k in proposal);
  const segments = (current.segments ?? []) as Record<string, unknown>[];
  const passengers = (current.passengers ?? []) as Record<string, unknown>[];
  const guests = (current.guests ?? []) as string[];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">{extraction.document?.title ?? 'Document'}</span>
          {extraction.kind && <StatusPill tone="info">{DOCUMENT_TYPE_LABEL[extraction.kind]}</StatusPill>}
          {extraction.kindConfidence && extraction.kindConfidence !== 'high' && <StatusPill tone="warning">kind read as {extraction.kindConfidence}</StatusPill>}
          {preview && <a className="ml-auto text-xs text-indigo-700 hover:underline inline-flex items-center gap-1" href={preview} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" />Open</a>}
        </div>
        {extraction.kindReason && <p className="text-xs text-slate-500">{extraction.kindReason}</p>}
        <div className="border border-slate-200 rounded-md bg-slate-100 overflow-hidden" style={{ height: 460 }}>
          {preview
            ? (extraction.document?.mimeType.startsWith('image/')
              ? <img src={preview} alt="" className="w-full h-full object-contain" />
              : <iframe src={preview} title="Document" className="w-full h-full" />)
            : <div className="h-full grid place-items-center text-sm text-slate-500">Loading the document…</div>}
        </div>
        <p className="text-[11px] text-slate-400">Read by {extraction.provider} · {extraction.model}. The link to this file lasts a minute.</p>
      </section>

      <section className="space-y-3">
        {summary && (
          <div className={`rounded-md border p-3 text-sm ${summary.toCheck ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
            {summary.toCheck
              ? <><AlertTriangle className="inline w-4 h-4 mr-1 -mt-0.5" />{summary.read} of {summary.total} fields were read plainly. Check the {summary.toCheck} marked below before saving.</>
              : <>All {summary.total} fields were read plainly. Check them once and save.</>}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map(k => {
            const f = answered(extraction.fields, map[k]);
            const v = current[k];
            return (
              <Field key={k} label={LABEL[k] ?? k} htmlFor={`f-${k}`} className={k === 'description' ? 'sm:col-span-2' : undefined}>
                <TextInput id={`f-${k}`}
                  type={DATE_FIELDS.has(k) ? 'date' : 'text'}
                  inputMode={NUMBER_FIELDS.has(k) ? 'decimal' : undefined}
                  value={v === null || v === undefined ? '' : String(v)}
                  placeholder={f && f.value === null ? 'Not shown on the document' : undefined}
                  onChange={e => set(k, NUMBER_FIELDS.has(k) ? (e.target.value === '' ? null : Number(e.target.value)) : (e.target.value || null))} />
                <ConfidencePill f={f} />
              </Field>
            );
          })}
        </div>

        {segments.length > 0 && (
          <div>
            <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-1">Legs</h3>
            <ul className="text-sm space-y-1">
              {segments.map((s, i) => (
                <li key={i} className="flex flex-wrap gap-x-2 text-slate-700">
                  <span className="font-medium">{String(s.fromName ?? '?')} → {String(s.toName ?? '?')}</span>
                  <span className="text-slate-500">{s.departAt ? String(s.departAt).slice(0, 16).replace('T', ' ') : 'no time read'}</span>
                  {s.serviceNumber ? <span className="text-slate-500">· {String(s.serviceNumber)}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {passengers.length > 0 && (
          <div>
            <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-1">Passengers ({passengers.length})</h3>
            <ul className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-1">
              {passengers.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <TextInput aria-label={`Passenger ${i + 1}`} value={String(p.name ?? '')}
                    onChange={e => set('passengers', passengers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <span className="text-xs text-slate-500 whitespace-nowrap">{[p.seat, p.status].filter(Boolean).join(' · ') || '—'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {guests.length > 0 && (
          <p className="text-sm text-slate-700"><span className="text-slate-500">Guests: </span>{guests.join(', ')}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MatchChoice label="Trip" matches={extraction.matches?.trip ?? []} value={tripId} onChange={setTripId}
            emptyHint="No trip looked like a clear match — choose one if it belongs to a tour" />
          {kind === 'VENDOR_BILL' && (
            <MatchChoice label="Supplier" matches={extraction.matches?.vendor ?? []} value={vendorId} onChange={setVendorId}
              emptyHint="Add the supplier in Suppliers first if they are new" />
          )}
        </div>
        {tripId && <p className="text-xs text-slate-500">It will be saved on <Link className="text-indigo-700 hover:underline" to={`/trips/${tripId}`}>{tripId}</Link>.</p>}

        <Field label="Note for the record (optional)" htmlFor="f-note">
          <TextInput id="f-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Checked against the SMS from IRCTC" />
        </Field>

        {rejecting ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Why set it aside" htmlFor="f-reason" className="flex-1 min-w-[220px]">
              <TextInput id="f-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Old ticket, already cancelled" />
            </Field>
            <Button variant="outline" loading={reject.isPending} disabled={!reason.trim()}
              onClick={() => reject.mutate(undefined, {
                onSuccess: () => { toast.success('Set aside', 'The document is kept; nothing was saved.'); onDone?.(); },
                onError: e => toast.error('Not saved', (e as ApiError).message),
              })}>Set aside</Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button loading={approve.isPending}
              onClick={() => approve.mutate(undefined, {
                onSuccess: r => { toast.success('Saved', `Created ${r.appliedKind?.replace(/_/g, ' ')} ${r.appliedId}`); onDone?.(); },
                onError: e => toast.error('Not saved', (e as ApiError).summary),
              })}><Check className="w-4 h-4 mr-1" />Save it</Button>
            <Button variant="ghost" onClick={() => setRejecting(true)}><X className="w-4 h-4 mr-1" />Set aside</Button>
            <span className="ml-auto self-center text-xs text-slate-400">Nothing is saved until you press Save.</span>
          </div>
        )}
      </section>
    </div>
  );
}
