import { useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { Drawer, StatusPill, DataTable, type Column, type Tone } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { toCsv } from '@/shared/calc/csv';
import { templateExample, templateHeaders, IMPORT_COLUMNS, type ImportKind } from '@/shared/calc/importMapping';
import type { ImportPreview, ImportRowResult } from '@/shared/contracts/masters';
import { ApiError } from '@/lib/api';
import { mastersApi } from '../api';
import { useMasterMutation } from '../hooks';

const TONE: Record<ImportRowResult['status'], Tone> = { create: 'success', update: 'info', error: 'danger', skip: 'neutral' };
const TITLE: Record<ImportKind, string> = { vendors: 'vendors', hotels: 'hotels', 'hotel-rates': 'hotel rate sheet', vehicles: 'vehicles', drivers: 'drivers', activities: 'activities' };

/** Reads CSV as text; Excel (first sheet) is converted to CSV in the browser so the server only ever validates CSV. */
async function fileToCsv(file: File): Promise<string> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('The workbook has no sheets');
    return XLSX.utils.sheet_to_csv(ws, { dateNF: 'yyyy-mm-dd', blankrows: false });
  }
  return file.text();
}

function downloadTemplate(kind: ImportKind) {
  const csv = toCsv(templateHeaders(kind), [templateExample(kind)]);
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${kind}-template.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function ImportDrawer({ kind, open, onOpenChange }: { kind: ImportKind; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const commit = useMasterMutation(({ csv: c, skip }: { csv: string; skip: boolean }) => mastersApi.importCommit(kind, c, skip));

  function reset() { setCsv(null); setFileName(''); setPreview(null); setSkipInvalid(false); }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const text = await fileToCsv(file);
      setCsv(text); setFileName(file.name);
      setPreview(await mastersApi.importPreview(kind, text));
    } catch (e) {
      toast.error('Could not read the file', e instanceof ApiError ? e.summary : (e as Error).message);
      reset();
    } finally { setBusy(false); }
  }

  function onCommit() {
    if (!csv) return;
    commit.mutate({ csv, skip: skipInvalid }, {
      onSuccess: r => { toast.success('Import complete', `${r.counts.create} added, ${r.counts.update} updated${r.counts.error ? `, ${r.counts.error} skipped` : ''}`); reset(); onOpenChange(false); },
      onError: e => toast.error('Import failed', (e as ApiError).summary),
    });
  }

  const cols: Column<ImportRowResult>[] = [
    { key: 'line', header: 'Line', width: '56px', render: r => <span className="tabular-nums text-slate-500">{r.line}</span> },
    { key: 'status', header: 'Result', width: '90px', render: r => <StatusPill tone={TONE[r.status]}>{r.status}</StatusPill> },
    { key: 'label', header: 'Record', render: r => <div><div className="text-slate-900">{r.label}</div>
      {Object.entries(r.errors).map(([k, v]) => <div key={k} className="text-xs text-red-600">{k === '_' ? '' : `${IMPORT_COLUMNS[kind].find(c => c.field === k)?.label ?? k}: `}{v}</div>)}</div> },
  ];
  const canCommit = !!preview && !preview.fileErrors.length && (preview.counts.create + preview.counts.update) > 0 && (preview.counts.error === 0 || skipInvalid);

  return (
    <Drawer open={open} onOpenChange={o => { if (!o) reset(); onOpenChange(o); }} width="xl" title={`Import ${TITLE[kind]}`}
      description="CSV or Excel. Every row is checked first; nothing is saved until you confirm."
      footer={preview ? <>
        {preview.counts.error > 0 && <label className="flex items-center gap-2 text-xs text-slate-600 mr-auto"><input type="checkbox" checked={skipInvalid} onChange={e => setSkipInvalid(e.target.checked)} />Skip the {preview.counts.error} row{preview.counts.error === 1 ? '' : 's'} with errors</label>}
        <Button variant="outline" onClick={reset}>Choose another file</Button>
        <Button onClick={onCommit} disabled={!canCommit} loading={commit.isPending}>Import {preview.counts.create + preview.counts.update} row{preview.counts.create + preview.counts.update === 1 ? '' : 's'}</Button>
      </> : undefined}>
      {!preview && (
        <div className="space-y-4">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-md py-10 cursor-pointer hover:bg-slate-50">
            <FileUp className="w-6 h-6 text-slate-400" />
            <span className="text-sm text-slate-700">{busy ? 'Checking…' : 'Choose a .csv, .xlsx or .xls file'}</span>
            <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="sr-only" disabled={busy} onChange={e => void onFile(e.target.files?.[0])} />
          </label>
          <button type="button" onClick={() => downloadTemplate(kind)} className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800"><Download className="w-4 h-4" />Download a template</button>
          <div className="text-xs text-slate-500">
            <p className="font-medium text-slate-600 mb-1">Columns</p>
            <p>{IMPORT_COLUMNS[kind].map(c => `${c.label}${c.required ? ' *' : ''}`).join(' · ')}</p>
            <p className="mt-1">Dates may be DD-MM-YYYY or YYYY-MM-DD. Existing records are matched and updated, not duplicated.</p>
          </div>
        </div>
      )}
      {preview && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">{fileName} · {preview.totalRows} rows</span>
            <StatusPill tone="success">{preview.counts.create} new</StatusPill>
            <StatusPill tone="info">{preview.counts.update} update</StatusPill>
            {preview.counts.error > 0 && <StatusPill tone="danger">{preview.counts.error} with errors</StatusPill>}
          </div>
          {preview.fileErrors.map(e => <div key={e} className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{e}</div>)}
          {preview.unknownHeaders.length > 0 && <p className="text-xs text-amber-700">Ignored columns: {preview.unknownHeaders.join(', ')}</p>}
          <DataTable dense columns={cols} rows={preview.rows} rowKey={r => String(r.line)} emptyTitle="No data rows found" />
        </div>
      )}
    </Drawer>
  );
}
