import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileUp, History, Trash2 } from 'lucide-react';
import { DataTable, Drawer, EmptyState, Field, PageHeader, Select, StatusPill, TextInput, Textarea, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { confirm } from '@/shared/hooks/useConfirm';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { fmtDate } from '@/shared/utils/date';
import { addDays, istToday } from '@/shared/calc/istTime';
import {
  DocumentStatus, DOCUMENT_STATUS_LABEL, DocumentType, DOCUMENT_TYPE_LABEL, ENTITY_LABEL, EXPIRING_TYPES, IDENTITY_TYPES,
  type DocumentEntityType, type DocumentStatus as DocStatus, type DocumentType as DocType,
} from '@/shared/contracts/documents';
import { documentsApi, type DocumentRow } from '../api';
import { openDocument, useDocument, useDocumentMutation, useDocuments } from '../hooks';
import { UploadForm } from '../components/UploadForm';

const STATUS_TONE: Record<DocStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  PENDING_UPLOAD: 'warning', UPLOADED: 'neutral', PROCESSING: 'info', EXTRACTED: 'info', NEEDS_REVIEW: 'warning', LINKED: 'success', FAILED: 'danger',
};
const niceSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Where a document's record lives, so a click goes to the work it belongs to. */
function recordPath(entityType: string, entityId: string): string | null {
  const map: Record<string, string> = {
    trip: `/trips/${entityId}`, customer: `/customers/${entityId}`, traveller: `/travellers/${entityId}`,
    vendor: `/suppliers/${entityId}`, invoice: `/invoices/${entityId}`, quotation: `/quotes/${entityId}`,
  };
  return map[entityType] ?? null;
}

function Details({ id, onGone }: { id: string; onGone: () => void }) {
  const { can } = usePermissions();
  const q = useDocument(id);
  const [replacing, setReplacing] = useState(false);
  const save = useDocumentMutation((body: Parameters<typeof documentsApi.update>[1]) => documentsApi.update(id, body));
  const remove = useDocumentMutation(() => documentsApi.remove(id));
  const d = q.data;

  if (q.isPending) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!d) return <EmptyState title="Not found" description="This document is no longer here." />;
  const identity = IDENTITY_TYPES.includes(d.type);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={STATUS_TONE[d.status]}>{DOCUMENT_STATUS_LABEL[d.status]}</StatusPill>
        {d.version > 1 && <StatusPill tone="info">version {d.version}</StatusPill>}
        <span className="text-xs text-slate-500">{d.fileName} · {niceSize(d.sizeBytes)}</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => openDocument(d.id).catch(e => toast.error('Could not open it', (e as ApiError).message))}>
          <Download className="w-3.5 h-3.5 mr-1" />Open
        </Button>
      </div>

      {can('documents:write') ? (
        <form className="space-y-3" onSubmit={e => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save.mutate({
            title: String(f.get('title') || '') || undefined,
            type: String(f.get('type')) as DocType,
            notes: String(f.get('notes') || '') || null,
            expiresAt: String(f.get('expiresAt') || '') || null,
            customerVisible: f.get('customerVisible') === 'on',
          }, { onSuccess: () => toast.success('Saved'), onError: x => toast.error('Not saved', (x as ApiError).message) });
        }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name" htmlFor="x-title"><TextInput id="x-title" name="title" defaultValue={d.title} /></Field>
            <Field label="What is it" htmlFor="x-type">
              <Select id="x-type" name="type" defaultValue={d.type}>
                {DocumentType.options.map(t => <option key={t} value={t}>{DOCUMENT_TYPE_LABEL[t]}</option>)}
              </Select>
            </Field>
            <Field label="Valid until" htmlFor="x-exp" hint={EXPIRING_TYPES.includes(d.type) ? 'Chased before it lapses' : undefined}>
              <TextInput id="x-exp" name="expiresAt" type="date" defaultValue={d.expiresAt?.slice(0, 10) ?? ''} />
            </Field>
            <Field label="Notes" htmlFor="x-notes" className="sm:col-span-2"><Textarea id="x-notes" name="notes" rows={2} defaultValue={d.notes ?? ''} /></Field>
          </div>
          {identity
            ? <p className="text-xs text-amber-700">Identity documents are never shown to customers.</p>
            : (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="customerVisible" defaultChecked={d.customerVisible} />
                The customer may see this one
              </label>
            )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={save.isPending}>Save</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setReplacing(true)}><FileUp className="w-3.5 h-3.5 mr-1" />Newer copy</Button>
            <Button type="button" size="sm" variant="ghost" className="text-red-600 ml-auto"
              onClick={async () => {
                if (!await confirm({ title: 'Delete this document?', description: 'The file goes too. A document that has been read into a record cannot be deleted.', confirmLabel: 'Delete', variant: 'destructive' })) return;
                remove.mutate(undefined, {
                  onSuccess: () => { toast.success('Deleted'); onGone(); },
                  onError: x => toast.error('Not deleted', (x as ApiError).message),
                });
              }}><Trash2 className="w-3.5 h-3.5 mr-1" />Delete</Button>
          </div>
        </form>
      ) : (
        <dl className="text-sm text-slate-700 space-y-1">
          <div><dt className="inline text-slate-500">Kind: </dt><dd className="inline">{DOCUMENT_TYPE_LABEL[d.type]}</dd></div>
          {d.expiresAt && <div><dt className="inline text-slate-500">Valid until: </dt><dd className="inline">{fmtDate(d.expiresAt)}</dd></div>}
          {d.notes && <p className="text-slate-600 whitespace-pre-wrap">{d.notes}</p>}
        </dl>
      )}

      <section>
        <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-1">Attached to</h3>
        {d.links.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
          <ul className="text-sm space-y-1">
            {d.links.map(l => {
              const to = recordPath(l.entityType, l.entityId);
              return (
                <li key={l.id}>
                  <span className="text-slate-500">{ENTITY_LABEL[l.entityType as DocumentEntityType] ?? l.entityType}: </span>
                  {to ? <Link className="text-indigo-700 hover:underline" to={to}>{l.entityId}</Link> : l.entityId}
                  {l.role && <span className="text-xs text-slate-500"> · {l.role}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {d.versions.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-1 flex items-center gap-1"><History className="w-3.5 h-3.5" />Other versions</h3>
          <ul className="text-sm space-y-1">
            {d.versions.map(v => (
              <li key={v.id}>
                <button type="button" className="text-indigo-700 hover:underline" onClick={() => openDocument(v.id).catch(() => toast.error('Could not open it'))}>
                  v{v.version} · {v.fileName}
                </button>
                <span className="text-xs text-slate-500"> · {v.uploadedAt ? fmtDate(v.uploadedAt) : 'not uploaded'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Drawer open={replacing} onOpenChange={setReplacing} title="Keep a newer copy">
        {replacing && <UploadForm replaces={{ id: d.id, title: d.title }} defaultType={d.type} onDone={() => setReplacing(false)} />}
      </Drawer>
    </div>
  );
}

/** Every file the office keeps, and what it belongs to. */
export default function DocumentsPage() {
  const { can } = usePermissions();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [expiring, setExpiring] = useState(false);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const list = useDocuments({
    type: (type || undefined) as DocType | undefined,
    status: (status || undefined) as DocStatus | undefined,
    q: q || undefined,
    expiringBefore: expiring ? addDays(istToday(), 90) : undefined,
    pageSize: 100,
  });

  const cols: Column<DocumentRow>[] = [
    { key: 'title', header: 'Document', render: d => (
      <button type="button" className="text-left" onClick={() => setOpen(d.id)}>
        <span className="font-medium text-slate-900 hover:underline">{d.title}</span>
        {d.version > 1 && <span className="ml-1 text-xs text-slate-500">v{d.version}</span>}
        <span className="block text-xs text-slate-500">{d.fileName}</span>
      </button>
    ) },
    { key: 'type', header: 'Kind', width: '150px', render: d => DOCUMENT_TYPE_LABEL[d.type] },
    { key: 'links', header: 'Attached to', hideBelow: 'md', render: d => (
      d.links.length === 0 ? <span className="text-slate-400">—</span> : (
        <span className="text-xs text-slate-600">
          {d.links.slice(0, 2).map(l => `${ENTITY_LABEL[l.entityType as DocumentEntityType] ?? l.entityType} ${l.entityId}`).join(', ')}
          {d.links.length > 2 && ` +${d.links.length - 2}`}
        </span>
      )
    ) },
    { key: 'expiresAt', header: 'Valid until', width: '120px', hideBelow: 'lg', render: d => (d.expiresAt ? fmtDate(d.expiresAt) : '—') },
    { key: 'status', header: '', width: '130px', render: d => <StatusPill tone={STATUS_TONE[d.status]}>{DOCUMENT_STATUS_LABEL[d.status]}</StatusPill> },
    { key: 'size', header: 'Size', width: '90px', align: 'right', hideBelow: 'lg', render: d => niceSize(d.sizeBytes) },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Documents" subtitle="Every ticket, confirmation, bill and identity copy the office keeps — with the record it belongs to"
        actions={
          <div className="flex items-center gap-2">
            <Link to="/settings/ai" className="text-xs text-slate-500 hover:text-slate-800">Document intelligence</Link>
            {can('documents:write') && <Button size="sm" onClick={() => setAdding(true)}><FileUp className="w-4 h-4 mr-1" />Keep a document</Button>}
          </div>
        } />

      <div className="px-5 py-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <TextInput className="w-64" placeholder="Search name, file or note" value={q} onChange={e => setQ(e.target.value)} />
          <Select aria-label="Kind" className="w-auto" value={type} onChange={e => setType(e.target.value)}>
            <option value="">Any kind</option>
            {DocumentType.options.map(t => <option key={t} value={t}>{DOCUMENT_TYPE_LABEL[t]}</option>)}
          </Select>
          <Select aria-label="State" className="w-auto" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Any state</option>
            {DocumentStatus.options.map(s => <option key={s} value={s}>{DOCUMENT_STATUS_LABEL[s]}</option>)}
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" checked={expiring} onChange={e => setExpiring(e.target.checked)} />
            Lapsing within 90 days
          </label>
          {list.data && <span className="ml-auto text-sm text-slate-600">{list.data.total} kept</span>}
        </div>

        <DataTable columns={cols} rows={list.data?.items ?? []} rowKey={d => d.id} loading={list.isPending} dense
          emptyTitle="Nothing kept yet"
          emptyHint="Keep tickets, hotel confirmations and supplier bills here, or add them from the trip they belong to." />
      </div>

      <Drawer open={adding} onOpenChange={setAdding} title="Keep a document">
        {adding && <UploadForm onDone={() => setAdding(false)} />}
      </Drawer>
      <Drawer open={!!open} onOpenChange={v => !v && setOpen(null)} title="Document">
        {open && <Details id={open} onGone={() => setOpen(null)} />}
      </Drawer>
    </div>
  );
}
