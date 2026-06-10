import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet, Printer, Download, IndianRupee, Receipt, FileMinus, FilePlus, Percent,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import apiClient from '@/lib/apiClient';
import { useStore } from '@/store';
import { fmtDate } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import { getFinancialYear } from '@/shared/utils/gst';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { EmptyState } from '@/shared/components/EmptyState';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/shared/components/ui/tabs';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/shared/components/ui/select';

// ─── Types ───────────────────────────────────────────────────

interface SalesRow {
  invoiceId: string; invoiceNumber: string; date: string; customerName: string;
  customerGstin: string | null; placeOfSupply: string | null; gstType: string;
  hsnSac: string; taxableAmount: number; cgstAmount: number; sgstAmount: number;
  igstAmount: number; totalGstAmount: number; totalAmount: number;
}

interface CnRow {
  creditNoteId: string; creditNoteNumber: string; date: string; customerName: string;
  invoiceNumber: string | null; reason: string; taxableAmount: number; cgstAmount: number;
  sgstAmount: number; igstAmount: number; totalGstAmount: number; totalAmount: number;
}

interface DnRow {
  debitNoteId: string; debitNoteNumber: string; date: string; customerName: string;
  invoiceNumber: string | null; reason: string; taxableAmount: number; cgstAmount: number;
  sgstAmount: number; igstAmount: number; totalGstAmount: number; totalAmount: number;
}

interface SummaryTotals {
  taxableAmount: number; cgstAmount: number; sgstAmount: number; igstAmount: number;
  totalGstAmount: number; totalAmount: number;
}

interface SummaryData {
  sales: SummaryTotals; creditNotes: SummaryTotals; debitNotes: SummaryTotals;
  netTaxableSales: number; netCgst: number; netSgst: number; netIgst: number;
  netGstLiability: number; netSalesValue: number;
  invoiceCount: number; creditNoteCount: number; debitNoteCount: number;
}

// ─── Period helpers ──────────────────────────────────────────

type PeriodMode = 'fy' | 'quarter' | 'month' | 'all';

function fyToRange(fy: string): { from: string; to: string } {
  const startYear = Number(fy.split('-')[0]);
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

function quarterToRange(fy: string, q: 1 | 2 | 3 | 4): { from: string; to: string } {
  const startYear = Number(fy.split('-')[0]);
  // Indian FY quarters: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar
  const ranges: Record<number, { from: string; to: string }> = {
    1: { from: `${startYear}-04-01`, to: `${startYear}-06-30` },
    2: { from: `${startYear}-07-01`, to: `${startYear}-09-30` },
    3: { from: `${startYear}-10-01`, to: `${startYear}-12-31` },
    4: { from: `${startYear + 1}-01-01`, to: `${startYear + 1}-03-31` },
  };
  return ranges[q];
}

function monthToRange(monthKey: string): { from: string; to: string } {
  // monthKey = "YYYY-MM"
  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, '0')}` };
}

function currentFy(): string {
  return getFinancialYear();
}

function fyOptions(): string[] {
  const cur = currentFy();
  const startYear = Number(cur.split('-')[0]);
  const opts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const y = startYear - i;
    opts.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`);
  }
  return opts;
}

function monthOptions(fy: string): { value: string; label: string }[] {
  const startYear = Number(fy.split('-')[0]);
  const months = [
    'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December', 'January', 'February', 'March',
  ];
  return months.map((label, idx) => {
    const year = idx < 9 ? startYear : startYear + 1;
    const monthNum = ((idx + 3) % 12) + 1; // Apr=4 ... Mar=3
    return { value: `${year}-${String(monthNum).padStart(2, '0')}`, label: `${label} ${year}` };
  });
}

// ─── Component ───────────────────────────────────────────────

export default function GstReports() {
  const navigate = useNavigate();
  const companySettings = useStore(s => s.companySettings);

  const [tab, setTab] = useState<'sales' | 'credit' | 'debit' | 'summary'>('sales');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('fy');
  const [fy, setFy] = useState(currentFy());
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(1);
  const [month, setMonth] = useState(monthOptions(currentFy())[0].value);

  const [salesRows, setSalesRows]   = useState<SalesRow[]>([]);
  const [cnRows, setCnRows]         = useState<CnRow[]>([]);
  const [dnRows, setDnRows]         = useState<DnRow[]>([]);
  const [summary, setSummary]       = useState<SummaryData | null>(null);
  const [loading, setLoading]       = useState(false);

  const range = useMemo(() => {
    if (periodMode === 'all')     return null;
    if (periodMode === 'fy')      return fyToRange(fy);
    if (periodMode === 'quarter') return quarterToRange(fy, quarter);
    return monthToRange(month);
  }, [periodMode, fy, quarter, month]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = range ? { from: range.from, to: range.to } : {};
    try {
      const [salesRes, cnRes, dnRes, summaryRes] = await Promise.all([
        apiClient.get<SalesRow[]>('/gst-reports/sales-register', { params }),
        apiClient.get<CnRow[]>('/gst-reports/credit-notes', { params }),
        apiClient.get<DnRow[]>('/gst-reports/debit-notes', { params }),
        apiClient.get<SummaryData>('/gst-reports/summary', { params }),
      ]);
      setSalesRows(salesRes.data);
      setCnRows(cnRes.data);
      setDnRows(dnRes.data);
      setSummary(summaryRes.data);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const periodLabel = useMemo(() => {
    if (periodMode === 'all') return 'All Time';
    if (periodMode === 'fy') return `FY ${fy}`;
    if (periodMode === 'quarter') return `Q${quarter} FY ${fy}`;
    return monthOptions(fy).find(m => m.value === month)?.label ?? month;
  }, [periodMode, fy, quarter, month]);

  function exportExcel() {
    const wb = XLSX.utils.book_new();

    const salesSheet = XLSX.utils.json_to_sheet(salesRows.map(r => ({
      'Invoice #': r.invoiceNumber, 'Date': r.date, 'Customer': r.customerName,
      'GSTIN': r.customerGstin ?? '', 'Place of Supply': r.placeOfSupply ?? '',
      'Type': r.gstType, 'HSN/SAC': r.hsnSac,
      'Taxable Value': r.taxableAmount, 'CGST': r.cgstAmount, 'SGST': r.sgstAmount,
      'IGST': r.igstAmount, 'Total GST': r.totalGstAmount, 'Total Value': r.totalAmount,
    })));
    XLSX.utils.book_append_sheet(wb, salesSheet, 'Sales Register');

    const cnSheet = XLSX.utils.json_to_sheet(cnRows.map(r => ({
      'Credit Note #': r.creditNoteNumber, 'Date': r.date, 'Customer': r.customerName,
      'Against Invoice': r.invoiceNumber ?? '', 'Reason': r.reason,
      'Taxable Value': r.taxableAmount, 'CGST': r.cgstAmount, 'SGST': r.sgstAmount,
      'IGST': r.igstAmount, 'Total GST': r.totalGstAmount, 'Total Value': r.totalAmount,
    })));
    XLSX.utils.book_append_sheet(wb, cnSheet, 'Credit Notes');

    const dnSheet = XLSX.utils.json_to_sheet(dnRows.map(r => ({
      'Debit Note #': r.debitNoteNumber, 'Date': r.date, 'Customer': r.customerName,
      'Against Invoice': r.invoiceNumber ?? '', 'Reason': r.reason,
      'Taxable Value': r.taxableAmount, 'CGST': r.cgstAmount, 'SGST': r.sgstAmount,
      'IGST': r.igstAmount, 'Total GST': r.totalGstAmount, 'Total Value': r.totalAmount,
    })));
    XLSX.utils.book_append_sheet(wb, dnSheet, 'Debit Notes');

    if (summary) {
      const summarySheet = XLSX.utils.json_to_sheet([
        { Metric: 'Sales — Taxable', Value: summary.sales.taxableAmount },
        { Metric: 'Sales — CGST', Value: summary.sales.cgstAmount },
        { Metric: 'Sales — SGST', Value: summary.sales.sgstAmount },
        { Metric: 'Sales — IGST', Value: summary.sales.igstAmount },
        { Metric: 'Sales — Total GST', Value: summary.sales.totalGstAmount },
        { Metric: 'Sales — Total Value', Value: summary.sales.totalAmount },
        { Metric: 'Credit Notes — Total GST', Value: summary.creditNotes.totalGstAmount },
        { Metric: 'Debit Notes — Total GST', Value: summary.debitNotes.totalGstAmount },
        { Metric: 'Net Taxable Sales', Value: summary.netTaxableSales },
        { Metric: 'Net CGST', Value: summary.netCgst },
        { Metric: 'Net SGST', Value: summary.netSgst },
        { Metric: 'Net IGST', Value: summary.netIgst },
        { Metric: 'Net GST Liability', Value: summary.netGstLiability },
        { Metric: 'Net Sales Value', Value: summary.netSalesValue },
      ]);
      XLSX.utils.book_append_sheet(wb, summarySheet, 'GST Summary');
    }

    XLSX.writeFile(wb, `GST-Report_${periodLabel.replace(/\s+/g, '_')}.xlsx`);
  }

  const TAB_CONFIG: { value: typeof tab; label: string; icon: typeof Receipt }[] = [
    { value: 'sales',   label: 'Sales Register',       icon: Receipt },
    { value: 'credit',  label: 'Credit Note Register', icon: FileMinus },
    { value: 'debit',   label: 'Debit Note Register',  icon: FilePlus },
    { value: 'summary', label: 'GST Summary',          icon: Percent },
  ];

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">GST Reports</h2>
          <Badge variant="secondary">{periodLabel}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportExcel}>
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Period filters */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex items-center gap-1.5">
          {([
            { value: 'fy', label: 'Financial Year' },
            { value: 'quarter', label: 'Quarter' },
            { value: 'month', label: 'Month' },
            { value: 'all', label: 'All Time' },
          ] as { value: PeriodMode; label: string }[]).map(opt => (
            <button key={opt.value}
              onClick={() => setPeriodMode(opt.value)}
              className={cn('text-xs px-3 py-1.5 rounded-full font-medium transition-all',
                periodMode === opt.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {opt.label}
            </button>
          ))}
        </div>

        {periodMode !== 'all' && (
          <Select value={fy} onValueChange={v => { setFy(v); setMonth(monthOptions(v)[0].value); }}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fyOptions().map(f => <SelectItem key={f} value={f}>FY {f}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {periodMode === 'quarter' && (
          <Select value={String(quarter)} onValueChange={v => setQuarter(Number(v) as 1 | 2 | 3 | 4)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Q1 (Apr-Jun)</SelectItem>
              <SelectItem value="2">Q2 (Jul-Sep)</SelectItem>
              <SelectItem value="3">Q3 (Oct-Dec)</SelectItem>
              <SelectItem value="4">Q4 (Jan-Mar)</SelectItem>
            </SelectContent>
          </Select>
        )}

        {periodMode === 'month' && (
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions(fy).map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <div className="text-lg font-bold">{companySettings?.companyName ?? 'GK Travels'} — GST Reports</div>
        <div className="text-sm text-gray-500">{periodLabel}</div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)}>
        <TabsList className="print:hidden">
          {TAB_CONFIG.map(t => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Sales Register */}
        <TabsContent value="sales">
          <RegisterTable
            loading={loading}
            empty={salesRows.length === 0}
            emptyTitle="No invoices in this period"
            columns={['Invoice #', 'Date', 'Customer', 'HSN/SAC', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total GST', 'Total']}
            rows={salesRows.map(r => [
              <span className="font-mono text-xs text-indigo-600 font-semibold">{r.invoiceNumber}</span>,
              fmtDate(r.date),
              <div>
                <div className="font-semibold text-gray-900">{r.customerName}</div>
                {r.customerGstin && <div className="text-[11px] text-gray-400 font-mono">{r.customerGstin}</div>}
              </div>,
              <span className="font-mono text-xs">{r.hsnSac || '—'}</span>,
              formatCurrency(r.taxableAmount),
              formatCurrency(r.cgstAmount),
              formatCurrency(r.sgstAmount),
              formatCurrency(r.igstAmount),
              formatCurrency(r.totalGstAmount),
              <span className="font-semibold">{formatCurrency(r.totalAmount)}</span>,
            ])}
            onRowClick={i => navigate(`/invoices/${salesRows[i].invoiceId}`)}
            totals={['', '', '', '',
              formatCurrency(salesRows.reduce((s, r) => s + r.taxableAmount, 0)),
              formatCurrency(salesRows.reduce((s, r) => s + r.cgstAmount, 0)),
              formatCurrency(salesRows.reduce((s, r) => s + r.sgstAmount, 0)),
              formatCurrency(salesRows.reduce((s, r) => s + r.igstAmount, 0)),
              formatCurrency(salesRows.reduce((s, r) => s + r.totalGstAmount, 0)),
              formatCurrency(salesRows.reduce((s, r) => s + r.totalAmount, 0)),
            ]}
          />
        </TabsContent>

        {/* Credit Note Register */}
        <TabsContent value="credit">
          <RegisterTable
            loading={loading}
            empty={cnRows.length === 0}
            emptyTitle="No credit notes in this period"
            columns={['Credit Note #', 'Date', 'Customer', 'Against Invoice', 'Reason', 'Taxable', 'Total GST', 'Total']}
            rows={cnRows.map(r => [
              <span className="font-mono text-xs text-amber-600 font-semibold">{r.creditNoteNumber}</span>,
              fmtDate(r.date),
              <span className="font-semibold text-gray-900">{r.customerName}</span>,
              <span className="font-mono text-xs">{r.invoiceNumber ?? '—'}</span>,
              r.reason,
              formatCurrency(r.taxableAmount),
              formatCurrency(r.totalGstAmount),
              <span className="font-semibold">{formatCurrency(r.totalAmount)}</span>,
            ])}
            onRowClick={i => navigate(`/credit-notes/${cnRows[i].creditNoteId}`)}
            totals={['', '', '', '', '',
              formatCurrency(cnRows.reduce((s, r) => s + r.taxableAmount, 0)),
              formatCurrency(cnRows.reduce((s, r) => s + r.totalGstAmount, 0)),
              formatCurrency(cnRows.reduce((s, r) => s + r.totalAmount, 0)),
            ]}
          />
        </TabsContent>

        {/* Debit Note Register */}
        <TabsContent value="debit">
          <RegisterTable
            loading={loading}
            empty={dnRows.length === 0}
            emptyTitle="No debit notes in this period"
            columns={['Debit Note #', 'Date', 'Customer', 'Against Invoice', 'Reason', 'Taxable', 'Total GST', 'Total']}
            rows={dnRows.map(r => [
              <span className="font-mono text-xs text-blue-600 font-semibold">{r.debitNoteNumber}</span>,
              fmtDate(r.date),
              <span className="font-semibold text-gray-900">{r.customerName}</span>,
              <span className="font-mono text-xs">{r.invoiceNumber ?? '—'}</span>,
              r.reason,
              formatCurrency(r.taxableAmount),
              formatCurrency(r.totalGstAmount),
              <span className="font-semibold">{formatCurrency(r.totalAmount)}</span>,
            ])}
            onRowClick={i => navigate(`/debit-notes/${dnRows[i].debitNoteId}`)}
            totals={['', '', '', '', '',
              formatCurrency(dnRows.reduce((s, r) => s + r.taxableAmount, 0)),
              formatCurrency(dnRows.reduce((s, r) => s + r.totalGstAmount, 0)),
              formatCurrency(dnRows.reduce((s, r) => s + r.totalAmount, 0)),
            ]}
          />
        </TabsContent>

        {/* GST Summary */}
        <TabsContent value="summary">
          {summary && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Net Taxable Sales', value: summary.netTaxableSales, icon: IndianRupee, color: 'text-emerald-600' },
                  { label: 'Net CGST',          value: summary.netCgst,         icon: Percent,     color: 'text-indigo-600' },
                  { label: 'Net SGST',          value: summary.netSgst,         icon: Percent,     color: 'text-indigo-600' },
                  { label: 'Net IGST',          value: summary.netIgst,         icon: Percent,     color: 'text-blue-600' },
                  { label: 'Net GST Liability', value: summary.netGstLiability, icon: Receipt,     color: 'text-red-500' },
                  { label: 'Net Sales Value',   value: summary.netSalesValue,   icon: IndianRupee, color: 'text-gray-900' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4">
                    <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center mb-2">
                      <Icon className={cn('w-4 h-4', color)} />
                    </div>
                    <div className={cn('text-lg font-bold font-display', color)}>{formatCurrency(value)}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['', 'Count', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total GST', 'Total Value'].map(h => (
                        <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[
                      { label: 'Sales (Invoices)', count: summary.invoiceCount, t: summary.sales, sign: '' },
                      { label: 'Less: Credit Notes', count: summary.creditNoteCount, t: summary.creditNotes, sign: '-' },
                      { label: 'Add: Debit Notes', count: summary.debitNoteCount, t: summary.debitNotes, sign: '+' },
                    ].map(row => (
                      <tr key={row.label}>
                        <td className="px-4 py-3 font-semibold text-gray-800">{row.label}</td>
                        <td className="px-4 py-3 text-gray-600">{row.count}</td>
                        <td className="px-4 py-3 text-gray-700">{row.sign}{formatCurrency(row.t.taxableAmount)}</td>
                        <td className="px-4 py-3 text-gray-700">{row.sign}{formatCurrency(row.t.cgstAmount)}</td>
                        <td className="px-4 py-3 text-gray-700">{row.sign}{formatCurrency(row.t.sgstAmount)}</td>
                        <td className="px-4 py-3 text-gray-700">{row.sign}{formatCurrency(row.t.igstAmount)}</td>
                        <td className="px-4 py-3 text-gray-700">{row.sign}{formatCurrency(row.t.totalGstAmount)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{row.sign}{formatCurrency(row.t.totalAmount)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-bold">
                      <td className="px-4 py-3 text-gray-900">Net</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-gray-900">{formatCurrency(summary.netTaxableSales)}</td>
                      <td className="px-4 py-3 text-gray-900">{formatCurrency(summary.netCgst)}</td>
                      <td className="px-4 py-3 text-gray-900">{formatCurrency(summary.netSgst)}</td>
                      <td className="px-4 py-3 text-gray-900">{formatCurrency(summary.netIgst)}</td>
                      <td className="px-4 py-3 text-gray-900">{formatCurrency(summary.netGstLiability)}</td>
                      <td className="px-4 py-3 text-gray-900">{formatCurrency(summary.netSalesValue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Register table ──────────────────────────────────────────

function RegisterTable({ loading, empty, emptyTitle, columns, rows, totals, onRowClick }: {
  loading: boolean;
  empty: boolean;
  emptyTitle: string;
  columns: string[];
  rows: React.ReactNode[][];
  totals?: React.ReactNode[];
  onRowClick?: (index: number) => void;
}) {
  if (!loading && empty) {
    return <EmptyState icon={Download} title={emptyTitle} />;
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {columns.map(h => (
                <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, i) => (
              <tr key={i} className={cn('hover:bg-gray-50 transition-colors', onRowClick && 'cursor-pointer')}
                onClick={() => onRowClick?.(i)}>
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3 text-gray-700 whitespace-nowrap">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {totals && rows.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-bold border-t border-gray-100">
                {totals.map((cell, j) => (
                  <td key={j} className="px-4 py-3 text-gray-900 whitespace-nowrap">{cell}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
