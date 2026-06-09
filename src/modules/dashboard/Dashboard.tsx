import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, FolderOpen, Users, IndianRupee,
  AlertTriangle, Clock, CalendarDays, Activity, ArrowRight, Building2, FileText, Map, FileCheck, Receipt,
  ClipboardCheck, ListChecks, Ticket,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore, selectors } from '@/store';
import {
  calcPortfolioFinance,
  normalizeTripFinance,
  FINANCIAL_STATUS_CLASS,
  FINANCIAL_STATUS_LABEL,
  RECEIVABLE_STATUS_CLASS,
  RECEIVABLE_STATUS_LABEL,
  calcReceivableFinance,
} from '@/shared/utils/finance';
import { APPROVAL_STATUS_LABEL, APPROVAL_STATUS_CLASS } from '@/shared/types';
import { getBookingPrimaryDate, TYPE_ICON as BOOKING_TYPE_ICON, STATUS_CONFIG as BOOKING_STATUS_CONFIG } from '@/modules/bookings/bookingMeta';
import type { ReceivableStatus } from '@/shared/types';
import { formatCurrency, formatCurrencyShort } from '@/shared/utils/format';
import { fmtDate, daysUntil, isThisMonth, isLastMonth, today } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Separator } from '@/shared/components/ui/separator';

// ─── KPI Card ────────────────────────────────────────────────

interface KpiCardProps {
  title:    string;
  value:    string;
  sub?:     string;
  trend?:   number;
  icon:     React.ElementType;
  color:    'blue' | 'green' | 'orange' | 'red' | 'purple';
  onClick?: () => void;
}

const COLOR_MAP = {
  blue:   'bg-blue-50 text-blue-600',
  green:  'bg-emerald-50 text-emerald-600',
  orange: 'bg-orange-50 text-orange-600',
  red:    'bg-red-50 text-red-600',
  purple: 'bg-purple-50 text-purple-600',
};

function KpiCard({ title, value, sub, trend, icon: Icon, color, onClick }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn('transition-all', onClick && 'cursor-pointer hover:shadow-md hover:border-gray-300')}
        onClick={onClick}
      >
        <CardContent className="pt-5">
          <div className="flex items-start justify-between mb-3">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', COLOR_MAP[color])}>
              <Icon className="w-4.5 h-4.5 w-[18px] h-[18px]" />
            </div>
            {trend !== undefined && trend !== 0 && (
              <span className={cn(
                'text-[11px] font-semibold flex items-center gap-0.5',
                trend > 0 ? 'text-emerald-600' : 'text-red-500'
              )}>
                {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {Math.abs(trend)}%
              </span>
            )}
          </div>
          <div className="font-bold text-2xl text-gray-900 font-display">{value}</div>
          <div className="text-xs text-gray-500 mt-1">{title}</div>
          {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────

export default function Dashboard() {
  const navigate          = useNavigate();
  const trips             = useStore(s => s.trips);
  const leads             = useStore(s => s.leads);
  const payments          = useStore(s => s.payments);
  const activityLog       = useStore(s => s.activityLog);
  const reminders         = useStore(selectors.pendingReminders);
  const vendors           = useStore(s => s.vendors);
  const vendorPayments    = useStore(s => s.vendorPayments);
  const totalVendorOwed   = useStore(selectors.totalVendorOutstanding);
  const quotations        = useStore(s => s.quotations);
  const itineraries       = useStore(s => s.itineraries);
  const vouchers          = useStore(s => s.vouchers);
  const receivables       = useStore(s => s.receivables);
  const bookings          = useStore(s => s.bookings);
  const tasks             = useStore(s => s.tasks);

  // Quotation KPIs
  const quotationKpis = useMemo(() => {
    const sent     = quotations.filter(q => ['sent', 'accepted', 'rejected'].includes(q.status)).length;
    const accepted = quotations.filter(q => q.status === 'accepted').length;
    const pipeline = quotations.filter(q => ['draft', 'sent'].includes(q.status))
      .reduce((s, q) => s + (q.totalSelling ?? 0), 0);
    return {
      total:          quotations.length,
      pipeline,
      acceptanceRate: sent > 0 ? Math.round((accepted / sent) * 100) : 0,
    };
  }, [quotations]);

  const stats = useMemo(() => {
    // Financial portfolio — trips must be mapped to PortfolioItem first because
    // Trip.status is TripStatus (lifecycle), not FinancialStatus (payment state).
    const portfolio = calcPortfolioFinance(trips.map(normalizeTripFinance));

    // This month vs last month revenue
    const thisMonthReceived = payments.customerPayments
      .filter(p => p.status === 'received' && isThisMonth(p.date))
      .reduce((s, p) => s + p.amount, 0);
    const lastMonthReceived = payments.customerPayments
      .filter(p => p.status === 'received' && isLastMonth(p.date))
      .reduce((s, p) => s + p.amount, 0);
    const revTrend = lastMonthReceived > 0
      ? Math.round(((thisMonthReceived - lastMonthReceived) / lastMonthReceived) * 100)
      : 0;

    // Net cash flow this month — mirrors Finance.tsx's monthlyData reduction
    // (received vs. supplier-paid), surfaced here as a single headline figure.
    const thisMonthSupplierPaid = payments.supplierPayments
      .filter(p => p.status === 'paid' && isThisMonth(p.paidDate || p.date))
      .reduce((s, p) => s + p.amount, 0);
    const netCashFlow = thisMonthReceived - thisMonthSupplierPaid;

    // Trips departing within 7 days
    const departingThisWeek = trips
      .filter(t => {
        const d = daysUntil(t.departure);
        return d !== null && d >= 0 && d <= 7 && t.status !== 'cancelled';
      })
      .sort((a, b) => (a.departure ?? '').localeCompare(b.departure ?? ''));

    // Overdue (departed with unpaid balance)
    const overdueTrips = trips.filter(t => {
      const d = daysUntil(t.departure);
      return d !== null && d < 0 && (t.balanceDue ?? 0) > 0 && t.status !== 'cancelled';
    });

    // Active trips
    const activeTrips = trips.filter(t => ['confirmed', 'in_progress'].includes(t.status));

    // Open leads
    const openLeads = leads.filter(l => !['converted', 'cancelled'].includes(l.status));

    return {
      portfolio,
      thisMonthReceived,
      revTrend,
      netCashFlow,
      departingThisWeek,
      overdueTrips,
      activeTrips,
      openLeads,
    };
  }, [trips, leads, payments]);

  // Receivables KPIs + recent payments feed
  const receivableStats = useMemo(() => {
    let totalBalance = 0, overdueBalance = 0, todayCollected = 0, upcomingDueBalance = 0;
    let upcomingDueCount = 0;
    const recentPayments: { entry: typeof receivables[number]['entries'][number]; customerName: string; status: ReceivableStatus }[] = [];
    const todayStr = today();

    for (const r of receivables) {
      const fin = calcReceivableFinance({ invoiceAmount: r.invoiceAmount, entries: r.entries, dueDate: r.dueDate });
      totalBalance += fin.balanceDue;
      if (fin.status === 'overdue') overdueBalance += fin.balanceDue;
      // Upcoming Dues — balance still owed, due within the next 7 days (not yet overdue)
      if (fin.balanceDue > 0 && fin.status !== 'overdue') {
        const d = daysUntil(r.dueDate);
        if (d !== null && d >= 0 && d <= 7) {
          upcomingDueBalance += fin.balanceDue;
          upcomingDueCount++;
        }
      }
      for (const e of r.entries) {
        recentPayments.push({ entry: e, customerName: r.customerName, status: fin.status });
        if (e.paymentDate === todayStr) todayCollected += e.amount;
      }
    }
    recentPayments.sort((a, b) => (b.entry.paymentDate || '').localeCompare(a.entry.paymentDate || ''));

    return {
      totalBalance, overdueBalance, todayCollected,
      upcomingDueBalance, upcomingDueCount,
      recentPayments: recentPayments.slice(0, 8),
    };
  }, [receivables]);

  // Operations widgets — pending approvals, today's activity, tasks due today
  const opsStats = useMemo(() => {
    const todayStr = today();

    const pendingApprovals = quotations
      .filter(q => q.approvalStatus === 'PENDING_APPROVAL')
      .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));

    const todaysActivity = activityLog.filter(a => a.date === todayStr);

    const tasksDueToday = tasks
      .filter(t => t.dueDate === todayStr && t.status !== 'completed' && t.status !== 'cancelled')
      .sort((a, b) => {
        const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        return order[a.priority] - order[b.priority];
      });

    return { pendingApprovals, todaysActivity, tasksDueToday };
  }, [quotations, activityLog, tasks]);

  // Booking departure / check-in alerts (next 7 days, not cancelled/completed)
  const bookingAlerts = useMemo(() => {
    const todayStr = today();
    return bookings
      .filter(b => b.status !== 'cancelled' && b.status !== 'completed')
      .map(b => ({ booking: b, date: getBookingPrimaryDate(b) }))
      .filter(({ date }) => {
        if (!date) return false;
        const d = daysUntil(date);
        return d !== null && d >= 0 && d <= 7;
      })
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  }, [bookings]);

  // Activity feed
  const recentActivity = useMemo(
    () => activityLog.slice(0, 15),
    [activityLog]
  );

  // Urgent reminders
  const urgentReminders = reminders
    .filter(r => r.priority === 'urgent' || r.priority === 'high')
    .slice(0, 5);

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* ── Overdue Alert ──────────────────────────────── */}
      {stats.overdueTrips.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-red-700">
              {stats.overdueTrips.length} trip{stats.overdueTrips.length > 1 ? 's' : ''} with outstanding balance after departure
            </span>
          </div>
          <div className="space-y-1">
            {stats.overdueTrips.map(t => (
              <div
                key={t.id}
                className="flex items-center justify-between text-xs cursor-pointer hover:text-red-700 transition-colors"
                onClick={() => navigate(`/trips/${t.id}`)}
              >
                <span className="text-red-600">
                  <span className="font-semibold">{t.customer}</span> → {t.destination}
                </span>
                <span className="font-bold text-red-700">{formatCurrency(t.balanceDue)} overdue</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Upcoming Booking Alerts ────────────────────── */}
      {bookingAlerts.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Ticket className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-blue-800">
              {bookingAlerts.length} booking{bookingAlerts.length > 1 ? 's' : ''} departing / checking in within 7 days
            </span>
          </div>
          <div className="space-y-1">
            {bookingAlerts.slice(0, 5).map(({ booking: b, date }) => {
              const d = date ? daysUntil(date) : null;
              const BIcon = BOOKING_TYPE_ICON[b.type];
              const statusCfg = BOOKING_STATUS_CONFIG[b.status];
              return (
                <div
                  key={b.id}
                  className="flex items-center justify-between text-xs cursor-pointer hover:text-blue-700 transition-colors"
                  onClick={() => navigate(`/bookings/${b.id}`)}
                >
                  <span className="flex items-center gap-2 text-blue-700">
                    <BIcon className="w-3 h-3 flex-shrink-0" />
                    <span className="font-semibold">{b.customerName}</span>
                    <span className="text-blue-500 capitalize">{b.type}</span>
                    <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', statusCfg.class)}>
                      {statusCfg.label}
                    </span>
                  </span>
                  <span className="font-bold text-blue-700">
                    {d === 0 ? 'Today' : `${d}d`} · {fmtDate(date!)}
                    {b.balanceDue > 0 && <span className="ml-2 text-red-600">· ₹{b.balanceDue.toLocaleString('en-IN')} due</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── KPI Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Collected"
          value={formatCurrencyShort(stats.portfolio.totalCollected)}
          sub={`This month: ${formatCurrency(stats.thisMonthReceived)}`}
          trend={stats.revTrend}
          icon={IndianRupee}
          color="green"
          onClick={() => navigate('/finance')}
        />
        <KpiCard
          title="Pending Balance"
          value={formatCurrencyShort(stats.portfolio.totalBalance)}
          sub={`${stats.portfolio.unpricedCount} unpriced trip${stats.portfolio.unpricedCount !== 1 ? 's' : ''}`}
          icon={Clock}
          color="orange"
          onClick={() => navigate('/finance')}
        />
        <KpiCard
          title="Active Trips"
          value={String(stats.activeTrips.length)}
          sub={`${stats.departingThisWeek.length} departing this week`}
          icon={FolderOpen}
          color="blue"
          onClick={() => navigate('/trips')}
        />
        <KpiCard
          title="Open Leads"
          value={String(stats.openLeads.length)}
          sub={`${leads.filter(l => isThisMonth(l.createdDate)).length} new this month`}
          icon={Users}
          color="purple"
          onClick={() => navigate('/leads')}
        />
        <KpiCard
          title="Vendor Payable"
          value={formatCurrencyShort(totalVendorOwed)}
          sub={`${vendors.filter(v => v.isActive).length} active vendors`}
          icon={Building2}
          color="red"
          onClick={() => navigate('/vendors')}
        />
        <KpiCard
          title="Today's Collections"
          value={formatCurrencyShort(receivableStats.todayCollected)}
          sub={`Received on ${fmtDate(today())}`}
          icon={IndianRupee}
          color="green"
          onClick={() => navigate('/receivables')}
        />
        <KpiCard
          title="Total Receivables"
          value={formatCurrencyShort(receivableStats.totalBalance)}
          sub={`${receivables.length} invoice${receivables.length !== 1 ? 's' : ''} tracked`}
          icon={Receipt}
          color="blue"
          onClick={() => navigate('/receivables')}
        />
        <KpiCard
          title="Overdue Amount"
          value={formatCurrencyShort(receivableStats.overdueBalance)}
          sub="Past due date, unpaid"
          icon={AlertTriangle}
          color="red"
          onClick={() => navigate('/receivables')}
        />
        <KpiCard
          title="Upcoming Dues"
          value={formatCurrencyShort(receivableStats.upcomingDueBalance)}
          sub={`${receivableStats.upcomingDueCount} due in next 7 days`}
          icon={Clock}
          color="orange"
          onClick={() => navigate('/receivables')}
        />
        <KpiCard
          title="Itineraries"
          value={String(itineraries.length)}
          sub={`${itineraries.filter(i => i.status === 'finalized').length} finalized`}
          icon={Map}
          color="orange"
          onClick={() => navigate('/itineraries')}
        />
        <KpiCard
          title="Vouchers"
          value={String(vouchers.length)}
          sub={`${vouchers.filter(v => v.status === 'issued').length} issued · ${vouchers.filter(v => v.status === 'completed').length} completed`}
          icon={FileCheck}
          color="green"
          onClick={() => navigate('/vouchers')}
        />
      </div>

      {/* ── Middle Row ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Departing This Week */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-blue-600" />
                Departing This Week
              </CardTitle>
              <button
                onClick={() => navigate('/trips')}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-0 pb-3">
            {stats.departingThisWeek.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                No departures scheduled this week
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {stats.departingThisWeek.map(t => {
                  const days = daysUntil(t.departure);
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 py-3 cursor-pointer group hover:bg-gray-50 -mx-3 px-3 rounded-lg transition-colors"
                      onClick={() => navigate(`/trips/${t.id}`)}
                    >
                      <div
                        className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0',
                          days === 0 ? 'bg-red-100 text-red-700' :
                          days === 1 ? 'bg-orange-100 text-orange-700' :
                          'bg-blue-100 text-blue-700'
                        )}
                      >
                        {days}d
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{t.customer}</p>
                        <p className="text-xs text-gray-500 truncate">{t.destination} · {t.pax} pax</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-semibold text-gray-700">{fmtDate(t.departure)}</p>
                        {(t.balanceDue ?? 0) > 0 && (
                          <p className="text-xs text-red-500 font-medium">{formatCurrency(t.balanceDue)} due</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Urgent Reminders */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                Pending Actions
                {urgentReminders.length > 0 && (
                  <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {urgentReminders.length}
                  </span>
                )}
              </CardTitle>
              <button
                onClick={() => navigate('/operations')}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-0 pb-3">
            {urgentReminders.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                No urgent actions — all clear!
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {urgentReminders.map(r => (
                  <div key={r.id} className="py-3">
                    <div className="flex items-start gap-2">
                      <span className={cn(
                        'mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0',
                        r.priority === 'urgent' ? 'bg-red-500' :
                        r.priority === 'high'   ? 'bg-orange-400' : 'bg-yellow-400'
                      )} />
                      <div className="flex-1">
                        <p className="text-xs text-gray-700">{r.message}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Due {fmtDate(r.dueDate)}</p>
                      </div>
                      <Badge
                        variant={r.priority === 'urgent' ? 'destructive' : 'warning'}
                        className="text-[10px] flex-shrink-0"
                      >
                        {r.priority}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Operations Overview ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Pending Approvals */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-purple-600" />
                Pending Approvals
                {opsStats.pendingApprovals.length > 0 && (
                  <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {opsStats.pendingApprovals.length}
                  </span>
                )}
              </CardTitle>
              <button
                onClick={() => navigate('/quotations')}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-0 pb-3">
            {opsStats.pendingApprovals.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                No quotations awaiting approval
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {opsStats.pendingApprovals.slice(0, 6).map(q => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between gap-3 py-2.5 cursor-pointer hover:bg-gray-50 -mx-3 px-3 rounded-lg transition-colors"
                    onClick={() => navigate(`/quotations/${q.id}`)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{q.customerName}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {q.id} · Submitted by {q.submittedBy ?? '—'}
                      </p>
                    </div>
                    <span className={cn('px-1.5 py-0.5 rounded-full font-medium text-[10px] flex-shrink-0', APPROVAL_STATUS_CLASS[q.approvalStatus])}>
                      {APPROVAL_STATUS_LABEL[q.approvalStatus]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tasks Due Today */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-blue-600" />
                Tasks Due Today
                {opsStats.tasksDueToday.length > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {opsStats.tasksDueToday.length}
                  </span>
                )}
              </CardTitle>
              <button
                onClick={() => navigate('/operations')}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-0 pb-3">
            {opsStats.tasksDueToday.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                No tasks due today
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {opsStats.tasksDueToday.slice(0, 6).map(t => (
                  <div key={t.id} className="py-2.5">
                    <div className="flex items-start gap-2">
                      <span className={cn(
                        'mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0',
                        t.priority === 'urgent' ? 'bg-red-500' :
                        t.priority === 'high'   ? 'bg-orange-400' :
                        t.priority === 'medium' ? 'bg-yellow-400' : 'bg-gray-300'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 truncate">{t.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{t.assignedTo ?? 'Unassigned'}</p>
                      </div>
                      <Badge
                        variant={t.priority === 'urgent' ? 'destructive' : 'warning'}
                        className="text-[10px] flex-shrink-0"
                      >
                        {t.priority}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Activity */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                Today's Activity
                {opsStats.todaysActivity.length > 0 && (
                  <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {opsStats.todaysActivity.length}
                  </span>
                )}
              </CardTitle>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-0 pb-3">
            {opsStats.todaysActivity.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                No activity recorded today
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {opsStats.todaysActivity.slice(0, 6).map(a => (
                  <div key={a.id} className="py-2">
                    <p className="text-xs text-gray-700 leading-snug">{a.description}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(a.timestamp).toLocaleTimeString('en-IN', {
                        hour: '2-digit', minute: '2-digit', hour12: true,
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Row ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Finance summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-emerald-600" />
              Finance Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {[
              { label: 'Total Revenue',   val: formatCurrency(stats.portfolio.totalRevenue),    color: 'text-gray-800' },
              { label: 'Collected',       val: formatCurrency(stats.portfolio.totalCollected),  color: 'text-emerald-600' },
              { label: 'Pending',         val: formatCurrency(stats.portfolio.totalPending),    color: 'text-orange-500' },
              { label: 'Supplier Costs',  val: formatCurrency(stats.portfolio.totalSupplier),  color: 'text-gray-700' },
              { label: 'Gross Margin',    val: formatCurrency(stats.portfolio.totalGrossMargin), color: 'text-blue-600' },
              { label: 'Avg Margin %',    val: `${stats.portfolio.avgMarginPct}%`,              color: 'text-blue-500' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between text-xs">
                <span className="text-gray-500">{row.label}</span>
                <span className={cn('font-semibold', row.color)}>{row.val}</span>
              </div>
            ))}
            <button
              onClick={() => navigate('/finance')}
              className="w-full mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium text-center"
            >
              Full report →
            </button>
          </CardContent>
        </Card>

        {/* Pipeline summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-600" />
              Lead Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0">
            {[
              { label: 'New',           status: 'new',            color: 'bg-gray-400'    },
              { label: 'Contacted',     status: 'contacted',      color: 'bg-blue-400'    },
              { label: 'Follow-up',     status: 'follow_up',      color: 'bg-yellow-400'  },
              { label: 'Quotation',     status: 'quotation_sent', color: 'bg-orange-400'  },
              { label: 'Confirmed',     status: 'confirmed',      color: 'bg-emerald-400' },
              { label: 'Converted',     status: 'converted',      color: 'bg-blue-600'    },
            ].map(row => {
              const count = leads.filter(l => l.status === row.status).length;
              return (
                <div key={row.status} className="flex items-center gap-3 text-xs">
                  <span className={cn('w-2 h-2 rounded-full flex-shrink-0', row.color)} />
                  <span className="text-gray-600 flex-1">{row.label}</span>
                  <span className="font-semibold text-gray-800">{count}</span>
                </div>
              );
            })}
            <button
              onClick={() => navigate('/leads')}
              className="w-full mt-1 text-xs text-blue-600 hover:text-blue-700 font-medium text-center"
            >
              View pipeline →
            </button>
          </CardContent>
        </Card>

      </div>

      {/* ── Recent Receivable Payments ─────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-indigo-600" />
              Recent Receivable Payments
            </CardTitle>
            <button
              onClick={() => navigate('/receivables')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-0 pb-3">
          {receivableStats.recentPayments.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              No receivable payments recorded yet
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {receivableStats.recentPayments.map(({ entry, customerName, status }) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between py-2.5 cursor-pointer hover:bg-gray-50 -mx-3 px-3 rounded-lg transition-colors"
                  onClick={() => navigate('/receivables')}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{customerName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{entry.paymentMode} · {fmtDate(entry.paymentDate)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-bold text-emerald-600">{formatCurrency(entry.amount)}</span>
                    <span className={cn('px-1.5 py-0.5 rounded-full font-medium text-[10px]', RECEIVABLE_STATUS_CLASS[status])}>
                      {RECEIVABLE_STATUS_LABEL[status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
