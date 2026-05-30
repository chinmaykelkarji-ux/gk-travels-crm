import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, IndianRupee, AlertTriangle,
  Download, RefreshCw, Calendar, Users, MapPin,
  Building2, FileText, ArrowUpRight, ArrowDownRight,
  CheckCircle, XCircle, Clock, BarChart2, Printer,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { motion } from 'framer-motion';
import apiClient from '@/lib/apiClient';
import { formatCurrency, formatCurrencyShort, formatPct } from '@/shared/utils/format';
import { fmtDate } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components/ui/tabs';

// ─── Types ───────────────────────────────────────────────────

interface Overview {
  totalRevenue:          number;
  totalCost:             number;
  grossProfit:           number;
  marginPct:             number;
  outstandingReceivables: number;
  overdueTrips:          number;
  outstandingPayables:   number;
  overdueVendors:        number;
  totalTripValue:        number;
  totalPaid:             number;
  tripCount:             number;
  activeTrips:           number;
  completedTrips:        number;
  cancelledTrips:        number;
  draftTrips:            number;
  quotationPipeline:     number;
  quotationCount:        number;
}

interface MonthlyRow {
  month:   string;
  revenue: number;
  cost:    number;
  profit:  number;
  margin:  number;
  trips:   number;
  leads:   number;
}

interface YearlyRow {
  year:          number;
  revenue:       number;
  cost:          number;
  profit:        number;
  trips:         number;
  revenueGrowth: number | null;
}

interface DestRow {
  destination: string;
  tripCount:   number;
  revenue:     number;
  cost:        number;
  profit:      number;
  balance:     number;
  marginPct:   number;
}

interface VendorRow {
  vendorId:    string;
  vendorName:  string;
  totalSpend:  number;
  totalPaid:   number;
  outstanding: number;
  engagements: number;
}

interface TripProfit {
  id:          string;
  customer:    string;
  destination: string;
  status:      string;
  revenue:     number;
  profit:      number;
  marginPct:   number;
  balanceDue:  number;
  totalValue:  number;
  departure:   string | null;
  createdDate: string;
}

interface TripsData {
  byProfit:     TripProfit[];
  lossMaking:   TripProfit[];
  byMargin:     TripProfit[];
  bottomMargin: TripProfit[];
}

interface CustomerRow {
  customerName: string;
  tripCount:    number;
  totalRevenue: number;
  totalProfit:  number;
  totalValue:   number;
  avgTripValue: number;
  isRepeat:     boolean;
}

interface AlertsData {
  negativeProfitTrips:    { id: string; customer: string; destination: string; profit: number; marginPct: number; revenue: number; status: string }[];
  overdueBalances:        { id: string; customer: string; destination: string; balanceDue: number; departure: string | null; status: string }[];
  overdueVendors:         { vendorName: string; outstanding: number; count: number }[];
  lowMarginQuotations:    { id: string; quotationNumber: string; customer: string; destination: string; marginPct: number; totalSelling: number }[];
}

// ─── Recharts colour palette ──────────────────────────────────

const CHART_COLORS = {
  revenue: '#4F46E5',
  cost:    '#EF4444',
  profit:  '#10B981',
  trips:   '#F59E0B',
  leads:   '#8B5CF6',
};

// ─── Tooltip formatter ────────────────────────────────────────

function currencyTick(v: number) { return formatCurrencyShort(v); }

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-xl text-xs">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-500 capitalize">{p.name}</span>
          <span className="font-semibold ml-auto pl-4">
            {typeof p.value === 'number' && p.name !== 'trips' && p.name !== 'leads'
              ? formatCurrency(p.value)
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── KPI card (local, richer than Dashboard one) ─────────────

function Metric({
  label, value, sub, trend, icon: Icon, color = 'indigo', onClick,
}: {
  label: string; value: string; sub?: string; trend?: number;
  icon: React.ElementType; color?: string; onClick?: () => void;
}) {
  const bg: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green:  'bg-emerald-50 text-emerald-600',
    red:    'bg-red-50 text-red-600',
    amber:  'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    blue:   'bg-blue-50 text-blue-600',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={cn('transition-all', onClick && 'cursor-pointer hover:shadow-md')} onClick={onClick}>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between mb-3">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', bg[color] ?? bg.indigo)}>
              <Icon className="w-4.5 h-4.5 w-[18px] h-[18px]" />
            </div>
            {trend !== undefined && trend !== 0 && (
              <span className={cn('text-[11px] font-semibold flex items-center gap-0.5',
                trend > 0 ? 'text-emerald-600' : 'text-red-500')}>
                {trend > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(trend)}%
              </span>
            )}
          </div>
          <div className="text-2xl font-bold text-gray-900 font-display">{value}</div>
          <div className="text-xs text-gray-500 mt-1">{label}</div>
          {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Export helpers ───────────────────────────────────────────

function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv  = [
    keys.join(','),
    ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(',')),
  ].join('\n');
  const a    = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: filename,
  });
  a.click();
}

// ─── Date presets ─────────────────────────────────────────────

function datePresets() {
  const now  = new Date();
  const y    = now.getFullYear();
  const m    = String(now.getMonth() + 1).padStart(2, '0');
  return {
    thisMonth: { from: `${y}-${m}-01`, to: `${y}-${m}-31` },
    thisYear:  { from: `${y}-01-01`,   to: `${y}-12-31`   },
    lastYear:  { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
    allTime:   { from: '', to: '' },
  };
}

// ═════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════

export default function Analytics() {
  const navigate = useNavigate();
  const presets  = useMemo(datePresets, []);

  const [from,      setFrom]      = useState('');
  const [to,        setTo]        = useState('');
  const [loading,   setLoading]   = useState(true);
  const [refreshAt, setRefreshAt] = useState(0);

  const [overview,   setOverview]   = useState<Overview | null>(null);
  const [monthly,    setMonthly]    = useState<MonthlyRow[]>([]);
  const [yearly,     setYearly]     = useState<YearlyRow[]>([]);
  const [dests,      setDests]      = useState<DestRow[]>([]);
  const [vendors,    setVendors]    = useState<VendorRow[]>([]);
  const [trips,      setTrips]      = useState<TripsData | null>(null);
  const [customers,  setCustomers]  = useState<CustomerRow[]>([]);
  const [alerts,     setAlerts]     = useState<AlertsData | null>(null);

  // Fetch all analytics in parallel
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to)   q.set('to',   to);
    const qs = q.toString() ? `?${q}` : '';

    try {
      const [ov, mo, yr, de, ve, tr, cu, al] = await Promise.all([
        apiClient.get(`/analytics/overview${qs}`),
        apiClient.get('/analytics/monthly?months=12'),
        apiClient.get('/analytics/yearly?years=3'),
        apiClient.get(`/analytics/destinations${qs}&limit=15`),
        apiClient.get(`/analytics/vendors${qs}&limit=15`),
        apiClient.get(`/analytics/trips${qs}`),
        apiClient.get(`/analytics/customers${qs}&limit=20`),
        apiClient.get('/analytics/alerts'),
      ]);
      setOverview(ov.data);
      setMonthly(mo.data);
      setYearly(yr.data);
      setDests(de.data);
      setVendors(ve.data);
      setTrips(tr.data);
      setCustomers(cu.data);
      setAlerts(al.data);
    } catch (err) {
      console.error('[analytics] fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [from, to, refreshAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const totalAlerts = alerts
    ? alerts.negativeProfitTrips.length + alerts.overdueBalances.length +
      alerts.overdueVendors.length + alerts.lowMarginQuotations.length
    : 0;

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header + controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Analytics</h2>
          {totalAlerts > 0 && (
            <Badge variant="destructive">{totalAlerts} alert{totalAlerts !== 1 ? 's' : ''}</Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date presets */}
          {[
            { label: 'This Month', key: 'thisMonth' as const },
            { label: 'This Year',  key: 'thisYear'  as const },
            { label: 'Last Year',  key: 'lastYear'  as const },
            { label: 'All Time',   key: 'allTime'   as const },
          ].map(p => (
            <button key={p.key}
              onClick={() => { setFrom(presets[p.key].from); setTo(presets[p.key].to); }}
              className={cn('text-xs px-3 py-1.5 rounded-full font-medium transition-all',
                from === presets[p.key].from && to === presets[p.key].to
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}>
              {p.label}
            </button>
          ))}

          {/* Custom range */}
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="h-8 rounded-xl border border-gray-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30 bg-white" />
          <span className="text-gray-400 text-xs">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="h-8 rounded-xl border border-gray-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30 bg-white" />

          <Button size="sm" variant="outline" className="gap-1.5"
            onClick={() => { setRefreshAt(Date.now()); }}>
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>

          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
        </div>
      </div>

      {loading && !overview && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {overview && (
        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="monthly">Trends</TabsTrigger>
            <TabsTrigger value="destinations">Destinations</TabsTrigger>
            <TabsTrigger value="vendors">Vendors</TabsTrigger>
            <TabsTrigger value="trips">Trips</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="alerts">
              Alerts {totalAlerts > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full px-1.5 py-0.5">{totalAlerts}</span>}
            </TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW TAB ───────────────────────────────── */}
          <TabsContent value="overview" className="space-y-5">

            {/* Executive KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              <Metric label="Total Revenue"     value={formatCurrencyShort(overview.totalRevenue)}    icon={IndianRupee} color="green" />
              <Metric label="Total Cost"        value={formatCurrencyShort(overview.totalCost)}       icon={ArrowDownRight} color="red" />
              <Metric label="Gross Profit"      value={formatCurrencyShort(overview.grossProfit)}     icon={TrendingUp}     color="indigo"
                trend={overview.marginPct > 0 ? overview.marginPct : undefined} />
              <Metric label="Margin %"          value={`${overview.marginPct.toFixed(1)}%`}           icon={BarChart2}      color="violet" />
              <Metric label="Outstanding Recv." value={formatCurrencyShort(overview.outstandingReceivables)} icon={Clock}   color="amber"
                sub={`${overview.overdueTrips} trips`} />
              <Metric label="Outstanding Pay."  value={formatCurrencyShort(overview.outstandingPayables)}    icon={Building2} color="red"
                sub={`${overview.overdueVendors} vendors`} />
            </div>

            {/* Trip status breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Total Trips',    value: overview.tripCount,      color: 'text-gray-900' },
                { label: 'Active',         value: overview.activeTrips,    color: 'text-indigo-600' },
                { label: 'Completed',      value: overview.completedTrips, color: 'text-emerald-600' },
                { label: 'Cancelled',      value: overview.cancelledTrips, color: 'text-red-500' },
                { label: 'Draft',          value: overview.draftTrips,     color: 'text-gray-400' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
                  <div className={cn('text-2xl font-bold font-display', s.color)}>{s.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Yearly summary */}
            {yearly.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Year-over-Year Revenue</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          {['Year', 'Revenue', 'Cost', 'Gross Profit', 'Margin', 'Trips', 'YoY Growth'].map(h => (
                            <th key={h} className="text-left text-[11px] font-semibold text-gray-500 pb-2 pr-4">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {yearly.map(r => (
                          <tr key={r.year} className="hover:bg-gray-50">
                            <td className="py-2.5 pr-4 font-bold text-gray-900">{r.year}</td>
                            <td className="py-2.5 pr-4 text-emerald-600 font-semibold">{formatCurrency(r.revenue)}</td>
                            <td className="py-2.5 pr-4 text-red-500">{formatCurrency(r.cost)}</td>
                            <td className={cn('py-2.5 pr-4 font-semibold', r.profit >= 0 ? 'text-indigo-600' : 'text-red-600')}>{formatCurrency(r.profit)}</td>
                            <td className="py-2.5 pr-4 text-gray-600">
                              {r.revenue > 0 ? `${((r.profit / r.revenue) * 100).toFixed(1)}%` : '—'}
                            </td>
                            <td className="py-2.5 pr-4 text-gray-600">{r.trips}</td>
                            <td className="py-2.5">
                              {r.revenueGrowth !== null ? (
                                <span className={cn('font-semibold text-xs', r.revenueGrowth >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                                  {r.revenueGrowth >= 0 ? '+' : ''}{r.revenueGrowth}%
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quotation pipeline */}
            {overview.quotationPipeline > 0 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-indigo-800">
                    {overview.quotationCount} quotation{overview.quotationCount !== 1 ? 's' : ''} in pipeline
                  </span>
                </div>
                <span className="text-indigo-700 font-bold font-display">{formatCurrency(overview.quotationPipeline)}</span>
              </div>
            )}
          </TabsContent>

          {/* ── MONTHLY TRENDS TAB ─────────────────────────── */}
          <TabsContent value="monthly" className="space-y-5">

            {/* Revenue + Profit area chart */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>12-Month Revenue & Profit Trend</CardTitle>
                  <Button size="sm" variant="ghost" className="gap-1.5"
                    onClick={() => downloadCSV(monthly as unknown as Record<string, unknown>[], 'monthly-trend.csv')}>
                    <Download className="w-3.5 h-3.5" /> CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={monthly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={CHART_COLORS.revenue} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={CHART_COLORS.revenue} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={CHART_COLORS.profit} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={CHART_COLORS.profit} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={currencyTick} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_COLORS.revenue} fill="url(#gRevenue)" strokeWidth={2} />
                    <Area type="monotone" dataKey="profit"  name="Profit"  stroke={CHART_COLORS.profit}  fill="url(#gProfit)"  strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Cost vs Revenue bar */}
            <Card>
              <CardHeader><CardTitle>Monthly Cost vs Revenue</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={currencyTick} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS.revenue} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cost"    name="Cost"    fill={CHART_COLORS.cost}    radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Bookings + Leads trend */}
            <Card>
              <CardHeader><CardTitle>Monthly Bookings & Leads</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={monthly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="trips" name="trips" stroke={CHART_COLORS.trips}  strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="leads" name="leads" stroke={CHART_COLORS.leads} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly table */}
            <Card>
              <CardHeader><CardTitle>Monthly Report</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Month', 'Revenue', 'Cost', 'Profit', 'Margin', 'Trips', 'Leads'].map(h => (
                          <th key={h} className="text-left font-semibold text-gray-500 pb-2 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[...monthly].reverse().map(r => (
                        <tr key={r.month} className="hover:bg-gray-50">
                          <td className="py-2 pr-4 font-medium text-gray-700">{r.month}</td>
                          <td className="py-2 pr-4 text-emerald-600 font-semibold">{formatCurrency(r.revenue)}</td>
                          <td className="py-2 pr-4 text-red-500">{formatCurrency(r.cost)}</td>
                          <td className={cn('py-2 pr-4 font-semibold', r.profit >= 0 ? 'text-indigo-600' : 'text-red-600')}>{formatCurrency(r.profit)}</td>
                          <td className="py-2 pr-4 text-gray-600">{r.margin.toFixed(1)}%</td>
                          <td className="py-2 pr-4 text-gray-600">{r.trips}</td>
                          <td className="py-2 text-gray-600">{r.leads}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── DESTINATIONS TAB ───────────────────────────── */}
          <TabsContent value="destinations" className="space-y-5">
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" className="gap-1.5"
                onClick={() => downloadCSV(dests as unknown as Record<string, unknown>[], 'destinations.csv')}>
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
            </div>

            {/* Bar chart */}
            <Card>
              <CardHeader><CardTitle>Revenue by Destination (Top 10)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dests.slice(0, 10)} layout="vertical" margin={{ top: 4, right: 16, left: 60, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                    <XAxis type="number" tickFormatter={currencyTick} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="destination" tick={{ fontSize: 11 }} width={55} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS.revenue} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="profit"  name="Profit"  fill={CHART_COLORS.profit}  radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardHeader><CardTitle>Destination Analytics</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Destination', 'Trips', 'Revenue', 'Cost', 'Profit', 'Outstanding', 'Margin'].map(h => (
                          <th key={h} className="text-left font-semibold text-gray-500 pb-2 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {dests.map(d => (
                        <tr key={d.destination} className="hover:bg-gray-50">
                          <td className="py-2.5 pr-4 font-medium text-gray-800 flex items-center gap-1.5">
                            <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />{d.destination}
                          </td>
                          <td className="py-2.5 pr-4 text-gray-600">{d.tripCount}</td>
                          <td className="py-2.5 pr-4 text-emerald-600 font-semibold">{formatCurrency(d.revenue)}</td>
                          <td className="py-2.5 pr-4 text-red-500">{formatCurrency(d.cost)}</td>
                          <td className={cn('py-2.5 pr-4 font-semibold', d.profit >= 0 ? 'text-indigo-600' : 'text-red-600')}>{formatCurrency(d.profit)}</td>
                          <td className={cn('py-2.5 pr-4', d.balance > 0 ? 'text-amber-600 font-semibold' : 'text-gray-400')}>{formatCurrency(d.balance)}</td>
                          <td className="py-2.5">
                            <span className={cn('font-semibold', d.marginPct >= 20 ? 'text-emerald-600' : d.marginPct >= 10 ? 'text-indigo-600' : 'text-red-500')}>
                              {d.marginPct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── VENDORS TAB ────────────────────────────────── */}
          <TabsContent value="vendors" className="space-y-5">
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" className="gap-1.5"
                onClick={() => downloadCSV(vendors as unknown as Record<string, unknown>[], 'vendor-analytics.csv')}>
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
            </div>

            {/* Top vendor spend chart */}
            <Card>
              <CardHeader><CardTitle>Vendor Spend Analysis (Top 10)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={vendors.slice(0, 10)} layout="vertical" margin={{ top: 4, right: 16, left: 80, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                    <XAxis type="number" tickFormatter={currencyTick} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="vendorName" tick={{ fontSize: 11 }} width={75} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="totalSpend"   name="Total Spend"  fill={CHART_COLORS.revenue} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="outstanding"  name="Outstanding"  fill={CHART_COLORS.cost}    radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Vendor Analytics</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Vendor', 'Engagements', 'Total Spend', 'Total Paid', 'Outstanding'].map(h => (
                          <th key={h} className="text-left font-semibold text-gray-500 pb-2 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {vendors.map(v => (
                        <tr key={v.vendorId || v.vendorName} className="hover:bg-gray-50">
                          <td className="py-2.5 pr-4 font-medium text-gray-800 flex items-center gap-1.5">
                            <Building2 className="w-3 h-3 text-gray-400 flex-shrink-0" />{v.vendorName}
                          </td>
                          <td className="py-2.5 pr-4 text-gray-600">{v.engagements}</td>
                          <td className="py-2.5 pr-4 font-semibold text-gray-800">{formatCurrency(v.totalSpend)}</td>
                          <td className="py-2.5 pr-4 text-emerald-600">{formatCurrency(v.totalPaid)}</td>
                          <td className={cn('py-2.5', v.outstanding > 0 ? 'text-amber-600 font-semibold' : 'text-gray-400')}>
                            {formatCurrency(v.outstanding)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TRIPS TAB ──────────────────────────────────── */}
          <TabsContent value="trips" className="space-y-5">
            {trips && (
              <>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {/* Top profitable */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-emerald-700">🏆 Most Profitable Trips</CardTitle>
                        <Button size="sm" variant="ghost" className="gap-1.5 text-xs"
                          onClick={() => downloadCSV(trips.byProfit as unknown as Record<string, unknown>[], 'top-trips.csv')}>
                          <Download className="w-3.5 h-3.5" /> CSV
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <TripTable rows={trips.byProfit} navigate={navigate} />
                    </CardContent>
                  </Card>

                  {/* Loss making */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-red-700">⚠️ Loss-Making Trips</CardTitle>
                        <Button size="sm" variant="ghost" className="gap-1.5 text-xs"
                          onClick={() => downloadCSV(trips.lossMaking as unknown as Record<string, unknown>[], 'loss-trips.csv')}>
                          <Download className="w-3.5 h-3.5" /> CSV
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {trips.lossMaking.length === 0
                        ? <p className="text-xs text-gray-400 py-6 text-center">No loss-making trips 🎉</p>
                        : <TripTable rows={trips.lossMaking} navigate={navigate} />
                      }
                    </CardContent>
                  </Card>

                  {/* By margin */}
                  <Card>
                    <CardHeader><CardTitle>📈 Highest Margin Trips</CardTitle></CardHeader>
                    <CardContent><TripTable rows={trips.byMargin} navigate={navigate} /></CardContent>
                  </Card>

                  {/* Bottom margin */}
                  <Card>
                    <CardHeader><CardTitle>📉 Lowest Margin Trips</CardTitle></CardHeader>
                    <CardContent>
                      {trips.bottomMargin.length === 0
                        ? <p className="text-xs text-gray-400 py-6 text-center">No data</p>
                        : <TripTable rows={trips.bottomMargin} navigate={navigate} />
                      }
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── CUSTOMERS TAB ──────────────────────────────── */}
          <TabsContent value="customers" className="space-y-5">
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" className="gap-1.5"
                onClick={() => downloadCSV(customers as unknown as Record<string, unknown>[], 'customers.csv')}>
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
            </div>

            <Card>
              <CardHeader><CardTitle>Customer Value Analysis</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Customer', 'Trips', 'Repeat?', 'Total Revenue', 'Total Profit', 'Avg Trip Value'].map(h => (
                          <th key={h} className="text-left font-semibold text-gray-500 pb-2 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {customers.map((c, i) => (
                        <tr key={c.customerName} className="hover:bg-gray-50">
                          <td className="py-2.5 pr-4 font-semibold text-gray-900 flex items-center gap-2">
                            {i < 3 && <span className="text-base">{['🥇', '🥈', '🥉'][i]}</span>}
                            {i >= 3 && <span className="w-5 h-5 rounded-full bg-gray-100 text-[10px] flex items-center justify-center font-bold text-gray-500">{i + 1}</span>}
                            {c.customerName}
                          </td>
                          <td className="py-2.5 pr-4 text-gray-600">{c.tripCount}</td>
                          <td className="py-2.5 pr-4">
                            {c.isRepeat
                              ? <Badge variant="success">Repeat</Badge>
                              : <Badge variant="secondary">New</Badge>
                            }
                          </td>
                          <td className="py-2.5 pr-4 text-emerald-600 font-semibold">{formatCurrency(c.totalRevenue)}</td>
                          <td className={cn('py-2.5 pr-4 font-semibold', c.totalProfit >= 0 ? 'text-indigo-600' : 'text-red-600')}>
                            {formatCurrency(c.totalProfit)}
                          </td>
                          <td className="py-2.5 text-gray-600">{formatCurrency(c.avgTripValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── ALERTS TAB ─────────────────────────────────── */}
          <TabsContent value="alerts" className="space-y-5">
            {alerts && (
              <>
                {alerts.negativeProfitTrips.length > 0 && (
                  <AlertSection
                    title="Loss-Making Trips"
                    icon={XCircle}
                    color="text-red-600"
                    bg="bg-red-50 border-red-200"
                  >
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-red-100">{['Trip', 'Customer', 'Destination', 'Profit', 'Margin'].map(h => <th key={h} className="text-left pb-2 pr-3 font-semibold text-red-600">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-red-50">
                        {alerts.negativeProfitTrips.map(t => (
                          <tr key={t.id} className="hover:bg-red-50 cursor-pointer transition-colors" onClick={() => navigate(`/trips/${t.id}`)}>
                            <td className="py-2 pr-3 font-mono text-red-700 font-semibold">{t.id}</td>
                            <td className="py-2 pr-3 text-gray-700">{t.customer}</td>
                            <td className="py-2 pr-3 text-gray-600">{t.destination}</td>
                            <td className="py-2 pr-3 text-red-700 font-bold">{formatCurrency(t.profit)}</td>
                            <td className="py-2 text-red-600">{t.marginPct.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </AlertSection>
                )}

                {alerts.overdueBalances.length > 0 && (
                  <AlertSection
                    title="Outstanding Customer Balances"
                    icon={Clock}
                    color="text-amber-600"
                    bg="bg-amber-50 border-amber-200"
                  >
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-amber-100">{['Trip', 'Customer', 'Destination', 'Balance Due', 'Departure'].map(h => <th key={h} className="text-left pb-2 pr-3 font-semibold text-amber-700">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-amber-50">
                        {alerts.overdueBalances.map(t => (
                          <tr key={t.id} className="hover:bg-amber-50 cursor-pointer" onClick={() => navigate(`/trips/${t.id}`)}>
                            <td className="py-2 pr-3 font-mono text-amber-700 font-semibold">{t.id}</td>
                            <td className="py-2 pr-3 text-gray-700">{t.customer}</td>
                            <td className="py-2 pr-3 text-gray-600">{t.destination}</td>
                            <td className="py-2 pr-3 text-amber-700 font-bold">{formatCurrency(t.balanceDue)}</td>
                            <td className="py-2 text-gray-500">{t.departure ? fmtDate(t.departure) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </AlertSection>
                )}

                {alerts.overdueVendors.length > 0 && (
                  <AlertSection
                    title="Outstanding Vendor Payments"
                    icon={Building2}
                    color="text-orange-600"
                    bg="bg-orange-50 border-orange-200"
                  >
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-orange-100">{['Vendor', 'Outstanding', 'Engagements'].map(h => <th key={h} className="text-left pb-2 pr-3 font-semibold text-orange-700">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-orange-50">
                        {alerts.overdueVendors.map(v => (
                          <tr key={v.vendorName}>
                            <td className="py-2 pr-3 font-medium text-gray-800">{v.vendorName}</td>
                            <td className="py-2 pr-3 text-orange-700 font-bold">{formatCurrency(v.outstanding)}</td>
                            <td className="py-2 text-gray-500">{v.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </AlertSection>
                )}

                {alerts.lowMarginQuotations.length > 0 && (
                  <AlertSection
                    title="Low-Margin Quotations (< 15%)"
                    icon={AlertTriangle}
                    color="text-yellow-600"
                    bg="bg-yellow-50 border-yellow-200"
                  >
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-yellow-100">{['Quotation', 'Customer', 'Destination', 'Selling', 'Margin'].map(h => <th key={h} className="text-left pb-2 pr-3 font-semibold text-yellow-700">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-yellow-50">
                        {alerts.lowMarginQuotations.map(q => (
                          <tr key={q.id} className="hover:bg-yellow-50 cursor-pointer" onClick={() => navigate(`/quotations/${q.id}`)}>
                            <td className="py-2 pr-3 font-mono text-yellow-700 font-semibold">{q.quotationNumber}</td>
                            <td className="py-2 pr-3 text-gray-700">{q.customer}</td>
                            <td className="py-2 pr-3 text-gray-600">{q.destination}</td>
                            <td className="py-2 pr-3 font-semibold">{formatCurrency(q.totalSelling)}</td>
                            <td className="py-2 text-yellow-700 font-bold">{q.marginPct.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </AlertSection>
                )}

                {totalAlerts === 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-10 text-center">
                    <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-emerald-800">All clear — no alerts at this time.</p>
                    <p className="text-xs text-emerald-600 mt-1">No loss-making trips, no overdue balances, and all quotations have healthy margins.</p>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function TripTable({ rows, navigate }: { rows: TripProfit[]; navigate: (path: string) => void }) {
  if (!rows.length) return <p className="text-xs text-gray-400 py-6 text-center">No data</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100">
            {['Trip', 'Customer', 'Destination', 'Revenue', 'Profit', 'Margin'].map(h => (
              <th key={h} className="text-left font-semibold text-gray-500 pb-2 pr-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(t => (
            <tr key={t.id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => navigate(`/trips/${t.id}`)}>
              <td className="py-2 pr-3 font-mono text-indigo-600 font-semibold">{t.id}</td>
              <td className="py-2 pr-3 text-gray-700 max-w-[100px] truncate">{t.customer}</td>
              <td className="py-2 pr-3 text-gray-600">{t.destination}</td>
              <td className="py-2 pr-3 text-emerald-600 font-semibold">{formatCurrency(t.revenue)}</td>
              <td className={cn('py-2 pr-3 font-bold', t.profit >= 0 ? 'text-indigo-600' : 'text-red-600')}>{formatCurrency(t.profit)}</td>
              <td className={cn('py-2 font-semibold', t.marginPct >= 20 ? 'text-emerald-600' : t.marginPct >= 10 ? 'text-indigo-600' : 'text-red-500')}>
                {t.marginPct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlertSection({
  title, icon: Icon, color, bg, children,
}: {
  title: string; icon: React.ElementType; color: string; bg: string; children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-2xl border p-5 space-y-3', bg)}>
      <div className={cn('flex items-center gap-2', color)}>
        <Icon className="w-4 h-4" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
