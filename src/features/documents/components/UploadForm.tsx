import { useRef, useState } from 'react';
import { Field, Select, TextInput, Textarea } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import {
  ALLOWED_MIME, DocumentType, DOCUMENT_TYPE_LABEL, EXPIRING_TYPES, IDENTITY_TYPES, MAX_DOCUMENT_BYTES,
  type DocumentLinkInput, type DocumentType as DocType,
} from '@/shared/contracts/documents';
import { documentsApi } from '../api';
import { useDocumentMutation } from '../hooks';

const ACCEPT = Object.keys(ALLOWED_MIME).join(',');
const niceSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Keeps a file where the work is. The file goes straight to storage with a
 * link that lives for a few minutes; TravelOS keeps the record of it.
 */
export function UploadForm({ links = [], defaultType = 'OTHER', replaces, onDone }: {
  links?: DocumentLinkInput[];
  defaultType?: DocType;
  /** When set, this is a newer copy of that document rather than a new one. */
  replaces?: { id: string; title: string };
  onDone: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<DocType>(defaultType);
  const [title, setTitle] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
  const [customerVisible, setCustomerVisible] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const identity = IDENTITY_TYPES.includes(type);
  const save = useDocumentMutation(async () => {
    if (!file) throw new ApiError(400, 'VALIDATION_ERROR', 'Choose a file first');
    const body = {
      fileName: file.name, mimeType: file.type, sizeBytes: file.size, type,
      title: title || undefined, notes: notes || undefined, expiresAt: expiresAt || undefined,
    };
    return replaces
      ? documentsApi.uploadVersion(replaces.id, body, file)
      : documentsApi.upload({ ...body, customerVisible: identity ? false : customerVisible, links }, file);
  });

  function pick(f: File | null) {
    setProblem(null);
    if (!f) { setFile(null); return; }
    if (!ALLOWED_MIME[f.type]) { setProblem(`${f.type || 'That file type'} cannot be kept here. Use a PDF, a photo, a Word or Excel file, or a CSV.`); setFile(null); return; }
    if (f.size > MAX_DOCUMENT_BYTES) { setProblem(`${niceSize(f.size)} is over the 25 MB limit.`); setFile(null); return; }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  const err = save.error as ApiError | null;

  return (
    <form className="space-y-3" onSubmit={e => {
      e.preventDefault();
      save.mutate(undefined, {
        onSuccess: d => { toast.success(replaces ? 'Newer copy kept' : 'Document kept', d.title); onDone(); },
        onError: x => toast.error('Not saved', (x as ApiError).message),
      });
    }}>
      {replaces && <p className="text-sm text-slate-600">A newer copy of <strong>{replaces.title}</strong>. The old one is kept with everything it is attached to.</p>}

      <Field label="File" htmlFor="d-file" required hint={`PDF, photo, Word, Excel or CSV — up to ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`}>
        <input ref={input} id="d-file" type="file" accept={ACCEPT} className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm hover:file:bg-slate-200"
          onChange={e => pick(e.target.files?.[0] ?? null)} />
      </Field>
      {file && <p className="text-xs text-slate-500">{file.name} · {niceSize(file.size)}</p>}
      {problem && <p className="text-sm text-red-600">{problem}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="What is it" htmlFor="d-type" required>
          <Select id="d-type" value={type} onChange={e => setType(e.target.value as DocType)}>
            {DocumentType.options.map(t => <option key={t} value={t}>{DOCUMENT_TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Name it" htmlFor="d-title" error={err?.fields?.title}>
          <TextInput id="d-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Kashi group — outbound ticket" />
        </Field>
        {EXPIRING_TYPES.includes(type) && (
          <Field label="Valid until" htmlFor="d-exp" hint="So it can be chased before it lapses">
            <TextInput id="d-exp" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
          </Field>
        )}
        <Field label="Notes" htmlFor="d-notes" className="sm:col-span-2">
          <Textarea id="d-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
      </div>

      {!replaces && (
        identity
          ? <p className="text-xs text-amber-700">Identity documents are never shown to customers and are kept behind short-lived links.</p>
          : (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5" checked={customerVisible} onChange={e => setCustomerVisible(e.target.checked)} />
              <span>The customer may see this one<span className="block text-xs text-slate-500">Used by the customer portal later; nothing is sent now.</span></span>
            </label>
          )
      )}

      {err && !err.fields && <p className="text-sm text-red-600">{err.message}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={!file}>Keep it</Button>
      </div>
    </form>
  );
}
