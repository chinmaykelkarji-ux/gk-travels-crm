import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IndianRupee, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, Clock, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '@/store';
import {
  calcPortfolioFinance,
  FINANCIAL_STATUS_CLASS,
  FINANCIAL_STATUS_LABEL,
  getFinancialStatus,
} from '@/shared/utils/finance';
import { formatCurrency, formatCurrencyShort } from '@/shared/utils/format';
import { fmtDate, isThisMonth, isLastMonth, monthKey, startOfMonthStr } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components/ui/tabs';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';

// ─── Metric KPI ──────────────────────────────────────────────

function FinMetric({
  label, value, sub, icon: Icon, trend, color = 'blue',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  trend?: number;
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple';
}) {
  const COLOR = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-emerald-50 text-emerald-600',
    orange: 'bg-orange-50 text-orange-600',
    red:    'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between mb-3">
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', COLOR[color])}>
            <Icon className="w-[18px] h-[18px]" />
          </div>
          {trend !== undefined && trend !== 0 && (
            <span className={cn('text-[11px] font-semibold flex items-center gap-0.5',
              trend > 0 ? 'text-emerald-600' : 'text-red-500')}>
              {trend > 0
                ? <ArrowUpRight className="w-3 h-3" />
                : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
        <div className="font-bold text-2xl text-gray-900 font-display">{value}</div>
        <div className="text-xs text-gray-500 mt-1">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Finance Module ───────────────────────────────────────────

export default function Finance() {
  const navigate  = useNavigate();
  const trips     = useStore(s => s.trips);
  const payments  = useStore(s => s.payments);
  const bookings  = useStore(s => s.bookings);

  const stats = useMemo(() => {
    const cp = payments.customerPayments;
    const sp = payments.supplierPayments;

    const received       = cp.filter(p => p.status === 'received').reduce((s, p) => s + p.amount, 0);
    const supplierPaid   = sp.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const thisMonthRec   = cp.filter(p => p.status === 'received' && isThisMonth(p.date)).reduce((s, p) => s + p.amount, 0);
    const lastMonthRec   = cp.filter(p => p.status === 'received' && isLastMonth(p.date)).reduce((s, p) => s + p.amount, 0);
    const revTrend       = lastMonthRec > 0
      ? Math.round(((thisMonthRec - lastMonthRec) / lastMonthRec) * 100)
      : 0;

    const portfolio = calcPortfolioFinance(trips);

    // Trips with balance due (overdue or at-risk)
    const urgentBalance = trips.filter(t => {
      const days = t.departure
        ? Math.round((new Date(t.departure).getTime() - Date.now()) / 86_400_000)
        : null;
      return (t.balanceDue ?? 0) > 0 && days !== null && days >= 0 && days <= 7;
    });

    // 6-month trend
    const monthlyData = Array.from({ length: 6 }, (_, i) => {
      const key  = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - i, 1));
      const rec  = cp.filter(p => p.status === 'received' && (p.date || '').startsWith(key)).reduce((s, p) => s + p.amount, 0);
      const paid = sp.filter(p => p.status === 'paid' && (p.paidDate || p.date || '').startsWith(key)).reduce((s, p) => s + p.amount, 0);
      return { key, received: rec, supplierPaid: paid, margin: rec - paid };
    }).reverse();

    return { received, supplierPaid, thisMonthRec, revTrend, portfolio, urgentBalance, monthlyData };
  }, [trips, payments]);

  // Overdue alert
  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* ── Overdue Balance Alert ──────────────────────── */}
      {stats.urgentBalance.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-red-700">
              {stats.urgentBalance.length} trip{stats.urgentBalance.length > 1 ? 's' : ''} departing within 7 days with outstanding balance
            </span>
          </div>
          <div className="space-y-1">
            {stats.urgentBalance.map(t => (
              <div
                key={t.id}
                className="flex items-center justify-between text-xs cursor-pointer hover:text-red-700"
                onClick={() => navigate(`/trips/${t.id}`)}
              >
                <span className="text-red-600">
                  <span className="font-semibold">{t.customer}</span> → {t.destination}
                </span>
                <span className="font-bold text-red-700">{formatCurrency(t.balanceDue)} due</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── KPI Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <FinMetric
          label="Total Collected"
          value={formatCurrencyShort(stats.received)}
          sub={`This month: ${formatCurrency(stats.thisMonthRec)}`}
          trend={stats.revTrend}
          icon={IndianRupee}
          color="green"
        />
        <FinMetric
          label="Pending Balance"
          value={formatCurrencyShort(stats.portfolio.totalBalance)}
          sub={`${stats.portfolio.unpricedCount} unpriced`}
          icon={Clock}
          color="orange"
        />
        <FinMetric
          label="Supplier Payments"
          value={formatCurrencyShort(stats.supplierPaid)}
          icon={ArrowDownRight}
          color="red"
        />
        <FinMetric
          label="Gross Margin"
          value={formatCurrencyShort(stats.portfolio.totalGrossMargin)}
          sub={`Avg ${stats.portfolio.avgMarginPct}%`}
          icon={TrendingUp}
          color="blue"
        />
      </div>

      {/* ── Tabs ───────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ledger">Customer Ledger</TabsTrigger>
          <TabsTrigger value="supplier">Supplier Ledger</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Report</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Trip P&L Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Trip P&L Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Trip', 'Selling Price', 'Collected', 'Balance', 'Margin', 'Status'].map(h => (
                          <th key={h} className="text-left font-semibold text-gray-500 pb-2 pr-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {trips.slice(0, 15).map(t => {
                        const status = getFinancialStatus(t.totalPayable, t.paidAmount);
                        return (
                          <tr
                            key={t.id}
                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => navigate(`/trips/${t.id}`)}
                          >
                            <td className="py-2.5 pr-3">
                              <div className="font-medium text-gray-800 max-w-[120px] truncate">{t.customer}</div>
                              <div className="text-gray-400 font-mono">{t.id}</div>
                            </td>
                            <td className="py-2.5 pr-3 text-gray-700">
                              {t.totalPayable !== null
                                ? formatCurrency(t.totalPayable)
                                : <span className="text-yellow-700 font-medium">⚠ Not set</span>
                              }
                            </td>
                            <td className="py-2.5 pr-3 text-emerald-600 font-medium">
                              {formatCurrency(t.paidAmount)}
                            </td>
                            <td className={cn('py-2.5 pr-3 font-medium', t.balanceDue > 0 ? 'text-red-600' : 'text-gray-400')}>
                              {formatCurrency(t.balanceDue)}
                            </td>
                            <td className={cn('py-2.5 pr-3 font-medium', t.marginPct > 0 ? 'text-blue-600' : 'text-gray-400')}>
                              {t.totalPayable !== null ? `${t.marginPct}%` : '—'}
                            </td>
                            <td className="py-2.5">
                              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', FINANCIAL_STATUS_CLASS[status])}>
                                {FINANCIAL_STATUS_LABEL[status]}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Unpriced Trips Warning */}
            {stats.portfolio.unpricedCount > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-yellow-700">
                    <AlertTriangle className="w-4 h-4" />
                    Unpriced Trips ({stats.portfolio.unpricedCount})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-gray-600 mb-3">
                    These trips have no selling price set. Revenue and balance calculations are incomplete until prices are set.
                  </p>
                  <div className="space-y-2">
                    {trips.filter(t => t.totalPayable === null).map(t => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between bg-yellow-50 rounded-lg px-3 py-2 cursor-pointer hover:bg-yellow-100 transition-colors"
                        onClick={() => navigate(`/trips/${t.id}`)}
                      >
                        <div>
                          <p className="text-xs font-semibold text-gray-800">{t.customer}</p>
                          <p className="text-[11px] text-gray-400">{t.destination} · {t.id}</p>
                        </div>
                        <span className="text-xs font-medium text-yellow-700">Set Price →</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Customer Ledger */}
        <TabsContent value="ledger">
          <Card>
            <CardHeader>
              <CardTitle>Customer Payment Ledger</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.customerPayments.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">No customer payments recorded</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Pay ID', 'Customer', 'Trip', 'Amount', 'Method', 'Date', 'Status'].map(h => (
                          <th key={h} className="text-left font-semibold text-gray-500 pb-2 pr-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {payments.customerPayments.map(p => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-2.5 pr-3 font-mono text-gray-400">{p.id}</td>
                          <td className="py-2.5 pr-3 font-medium text-gray-800">{p.customer || '—'}</td>
                          <td className="py-2.5 pr-3 text-gray-500">{p.tripId || '—'}</td>
                          <td className="py-2.5 pr-3 font-semibold text-emerald-600">{formatCurrency(p.amount)}</td>
                          <td className="py-2.5 pr-3 text-gray-600">{p.method}</td>
                          <td className="py-2.5 pr-3 text-gray-500">{fmtDate(p.date)}</td>
                          <td className="py-2.5">
                            <Badge variant={p.status === 'received' ? 'success' : 'warning'}>
                              {p.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Supplier Ledger */}
        <TabsContent value="supplier">
          <Card>
            <CardHeader>
              <CardTitle>Supplier Payment Ledger</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.supplierPayments.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">No supplier payments recorded</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Pay ID', 'Supplier', 'Trip', 'Amount', 'Method', 'Date', 'Status'].map(h => (
                          <th key={h} className="text-left font-semibold text-gray-500 pb-2 pr-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {payments.supplierPayments.map(p => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-2.5 pr-3 font-mono text-gray-400">{p.id}</td>
                          <td className="py-2.5 pr-3 font-medium text-gray-800">{p.customer || '—'}</td>
                          <td className="py-2.5 pr-3 text-gray-500">{p.tripId || '—'}</td>
                          <td className="py-2.5 pr-3 font-semibold text-red-500">{formatCurrency(p.amount)}</td>
                          <td className="py-2.5 pr-3 text-gray-600">{p.method}</td>
                          <td className="py-2.5 pr-3 text-gray-500">{fmtDate(p.date)}</td>
                          <td className="py-2.5">
                            <Badge variant={p.status === 'paid' ? 'success' : 'warning'}>
                              {p.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monthly Report */}
        <TabsContent value="monthly">
          <Card>
            <CardHeader>
              <CardTitle>6-Month Revenue Report</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Month', 'Revenue Collected', 'Supplier Paid', 'Gross Margin', 'Margin %'].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-gray-500 pb-2 pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stats.monthlyData.map(row => {
                      const pct = row.received > 0 ? Math.round((row.margin / row.received) * 100) : 0;
                      return (
                        <tr key={row.key} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 pr-4 font-medium text-gray-700">{row.key}</td>
                          <td className="py-3 pr-4 text-emerald-600 font-semibold">{formatCurrency(row.received)}</td>
                          <td className="py-3 pr-4 text-red-500">{formatCurrency(row.supplierPaid)}</td>
                          <td className={cn('py-3 pr-4 font-semibold', row.margin >= 0 ? 'text-blue-600' : 'text-red-600')}>
                            {formatCurrency(row.margin)}
                          </td>
                          <td className={cn('py-3 font-medium', pct >= 0 ? 'text-blue-500' : 'text-red-500')}>
                            {pct}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-xs text-blue-700">
                  <strong>Note:</strong> "Gross Margin" = Revenue Collected − Supplier Costs. This does NOT include overhead expenses (salaries, rent, marketing). For Net Profit, add these in the Settings module.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
