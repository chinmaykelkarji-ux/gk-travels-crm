import { useState } from 'react';
import { Download, FileText, Paperclip, Plus } from 'lucide-react';
import { Drawer, EmptyState, StatusPill } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { fmtDate } from '@/shared/utils/date';
import { DOCUMENT_TYPE_LABEL, type DocumentEntityType, type DocumentType } from '@/shared/contracts/documents';
import type { DocumentRow } from '../api';
import { openDocument, useDocuments } from '../hooks';
import { UploadForm } from './UploadForm';

const niceSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function DocumentLine({ d }: { d: DocumentRow }) {
  const open = () => openDocument(d.id).catch(e => toast.error('Could not open it', (e as ApiError).message));
  return (
    <li className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
      <button type="button" className="font-medium text-slate-900 hover:underline text-left" onClick={open}>{d.title}</button>
      <span className="text-xs text-slate-500">{DOCUMENT_TYPE_LABEL[d.type]}</span>
      {d.version > 1 && <StatusPill tone="info">v{d.version}</StatusPill>}
      {d.status === 'PENDING_UPLOAD' && <StatusPill tone="warning">waiting for the file</StatusPill>}
      {d.expiresAt && <span className="text-xs text-slate-500">valid until {fmtDate(d.expiresAt)}</span>}
      <span className="ml-auto text-xs text-slate-400">{niceSize(d.sizeBytes)} · {fmtDate(d.uploadedAt ?? d.createdAt)}</span>
      <Button size="sm" variant="ghost" onClick={open} title="Open with a link that lasts a minute"><Download className="w-3.5 h-3.5" /></Button>
    </li>
  );
}

/**
 * The documents kept against one record — a trip, a customer, a supplier —
 * with the upload that attaches straight to it.
 */
export function DocumentsPanel({ entityType, entityId, defaultType, title = 'Documents', linkRole }: {
  entityType: DocumentEntityType;
  entityId: string;
  defaultType?: DocumentType;
  title?: string;
  linkRole?: string;
}) {
  const { can } = usePermissions();
  const [adding, setAdding] = useState(false);
  const list = useDocuments({ entityType, entityId, pageSize: 50 });

  return (
    <section className="bg-white border border-slate-200 rounded-md">
      <header className="px-4 py-2 flex items-center justify-between border-b border-slate-100">
        <h2 className="text-sm font-medium text-slate-800 flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5 text-slate-400" />{title}</h2>
        {can('documents:write') && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>}
      </header>

      {list.isPending && <p className="px-4 py-3 text-sm text-slate-500">Loading…</p>}
      {list.data && list.data.items.length === 0 && (
        <EmptyState compact title="Nothing kept here yet" description="Tickets, confirmations and bills you put here stay with this record." />
      )}
      {list.data && list.data.items.length > 0 && (
        <ul className="divide-y divide-slate-100">{list.data.items.map(d => <DocumentLine key={d.id} d={d} />)}</ul>
      )}

      <Drawer open={adding} onOpenChange={setAdding} title="Keep a document">
        {adding && <UploadForm links={[{ entityType, entityId, ...(linkRole ? { role: linkRole } : {}) }]} defaultType={defaultType} onDone={() => setAdding(false)} />}
      </Drawer>
    </section>
  );
}
