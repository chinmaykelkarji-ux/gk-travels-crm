import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, FolderOpen, Users, IndianRupee,
  AlertTriangle, Clock, CalendarDays, ArrowRight, Building2, Receipt,
  ClipboardCheck, ListChecks, Percent, MessageCircle, Mail,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore, selectors } from '@/store';
import {
  calcPortfolioFinance,
  normalizeTripFinance,
  RECEIVABLE_STATUS_CLASS,
  RECEIVABLE_STATUS_LABEL,
  calcReceivableFinance,
} from '@/shared/utils/finance';
import { APPROVAL_STATUS_LABEL, APPROVAL_STATUS_CLASS } from '@/shared/types';
import { getBookingPrimaryDate, TYPE_ICON as BOOKING_TYPE_ICON, STATUS_CONFIG as BOOKING_STATUS_CONFIG } from '@/modules/bookings/bookingMeta';
import { whatsapp, gmail } from '@/shared/utils/email';
import type { ReceivableStatus, CabDetail, HotelDetail, FlightDetail } from '@/shared/types';
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

// ─── Due Item (unified daily ops / due-this-week feed) ────────

interface DueAction {
  icon:    React.ElementType;
  label:   string;
  onClick: () => void;
}

interface DueItem {
  id:        string;
  icon:      React.ElementType;
  iconClass: string;
  title:     string;
  subtitle:  string;
  date:      string;
  daysUntil: number;
  amount?:   number;
  url:       string;
  webCheckinDue?: boolean;
  actions?:  DueAction[];
}

// ─── Main Dashboard ──────────────────────────────────────────

export default function Dashboard() {
  const navigate          = useNavigate();
  const trips             = useStore(s => s.trips);
  const customers         = useStore(s => s.customers);
  const leads             = useStore(s => s.leads);
  const payments          = useStore(s => s.payments);
  const reminders         = useStore(selectors.pendingReminders);
  const vendorPayments    = useStore(s => s.vendorPayments);
  const quotations        = useStore(s => s.quotations);
  const receivables       = useStore(s => s.receivables);
  const bookings          = useStore(s => s.bookings);
  const tasks             = useStore(s => s.tasks);
  const invoices          = useStore(s => s.invoices);
  const creditNotes       = useStore(s => s.creditNotes);
  const debitNotes        = useStore(s => s.debitNotes);

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

    return {
      portfolio,
      thisMonthReceived,
      revTrend,
      netCashFlow,
      departingThisWeek,
      overdueTrips,
      activeTrips,
    };
  }, [trips, payments]);

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

  // Invoicing / GST KPIs
  const invoiceStats = useMemo(() => {
    const issuedInvoices = invoices.filter(i => i.status === 'ISSUED');
    const issuedCredit   = creditNotes.filter(c => c.status === 'ISSUED');
    const issuedDebit    = debitNotes.filter(d => d.status === 'ISSUED');

    const gstCollected  = issuedInvoices.reduce((s, i) => s + i.totalGstAmount, 0)
      - issuedCredit.reduce((s, c) => s + c.totalGstAmount, 0)
      + issuedDebit.reduce((s, d) => s + d.totalGstAmount, 0);
    const monthlySales = issuedInvoices
      .filter(i => isThisMonth(i.invoiceDate))
      .reduce((s, i) => s + i.totalAmount, 0);

    return { gstCollected, monthlySales };
  }, [invoices, creditNotes, debitNotes]);

  // Operations widgets — pending approvals, tasks due today
  const opsStats = useMemo(() => {
    const todayStr = today();

    const pendingApprovals = quotations
      .filter(q => q.approvalStatus === 'PENDING_APPROVAL')
      .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));

    const tasksDueToday = tasks
      .filter(t => t.dueDate === todayStr && t.status !== 'completed' && t.status !== 'cancelled')
      .sort((a, b) => {
        const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        return order[a.priority] - order[b.priority];
      });

    return { pendingApprovals, tasksDueToday };
  }, [quotations, tasks]);

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

  // Urgent reminders
  const urgentReminders = reminders
    .filter(r => r.priority === 'urgent' || r.priority === 'high')
    .slice(0, 5);

  // Find a customer's phone/email — via linked trip first, then customer record
  function findContact(customerId?: string, refTripId?: string, customerName?: string): { phone?: string; email?: string } {
    if (refTripId) {
      const trip = trips.find(t => t.id === refTripId);
      if (trip?.phone) return { phone: trip.phone, email: trip.email };
    }
    if (customerId) {
      const c = customers.find(c => c.id === customerId);
      if (c) return { phone: c.phone, email: c.email };
    }
    const c = customers.find(c => c.name === customerName);
    return { phone: c?.phone, email: c?.email };
  }

  // Build a short summary of the day after `dateStr` from a trip's itinerary
  function nextDayPlan(refTripId: string | undefined, dateStr: string | undefined): string | undefined {
    if (!refTripId || !dateStr) return undefined;
    const trip = trips.find(t => t.id === refTripId);
    if (!trip?.itinerary?.length) return undefined;
    const next = new Date(dateStr);
    next.setDate(next.getDate() + 1);
    const nextStr = next.toISOString().slice(0, 10);
    const day = trip.itinerary.find(d => d.date === nextStr);
    if (!day) return undefined;
    return [
      day.title,
      day.description,
      day.activities?.length ? `Activities: ${day.activities.join(', ')}` : '',
    ].filter(Boolean).join('\n');
  }

  // ── Unified "Due This Week" feed — daily ops + ops dashboard items,
  // merged with trip departures and supplier payments, sorted so the
  // earliest-due item (today first) appears at the top of the list.
  const dueItems = useMemo((): DueItem[] => {
    const items: DueItem[] = [];

    for (const t of stats.departingThisWeek) {
      const d = daysUntil(t.departure);
      if (d === null) continue;
      const actions: DueAction[] = [];
      if (t.phone) {
        actions.push({
          icon:  MessageCircle,
          label: 'Cab Reminder',
          onClick: () => whatsapp.cabReminder({
            phone:        t.phone,
            customerName: t.customer,
            pickupDate:   t.departure ?? undefined,
            drop:         t.destination,
            vehicleType:  t.transportMode,
            driverName:   t.cabDriver,
            driverPhone:  t.cabContact,
            nextDayPlan:  nextDayPlan(t.id, t.departure ?? undefined),
          }),
        });
      }
      items.push({
        id:        `trip-${t.id}`,
        icon:      FolderOpen,
        iconClass: 'bg-indigo-50 text-indigo-600',
        title:     `${t.customer} — ${t.destination}`,
        subtitle:  `Trip departure · ${t.pax} pax`,
        date:      t.departure!,
        daysUntil: d,
        amount:    (t.balanceDue ?? 0) > 0 ? t.balanceDue : undefined,
        url:       `/trips/${t.id}`,
        actions,
      });
    }

    for (const { booking: b, date } of bookingAlerts) {
      if (!date) continue;
      const d = daysUntil(date);
      if (d === null) continue;
      const BIcon = BOOKING_TYPE_ICON[b.type];
      const statusCfg = BOOKING_STATUS_CONFIG[b.status];
      const contact = findContact(b.customerId, b.refId, b.customerName);
      const actions: DueAction[] = [];
      let webCheckinDue = false;

      if (b.type === 'cab') {
        const detail = b.detail as CabDetail;
        if (contact.phone) {
          actions.push({
            icon:  MessageCircle,
            label: 'Cab Reminder',
            onClick: () => whatsapp.cabReminder({
              phone:        contact.phone!,
              customerName: b.customerName,
              pickupDate:   detail.pickupDate,
              pickupTime:   detail.pickupTime,
              pickup:       detail.pickup,
              drop:         detail.drop,
              vehicleType:  detail.vehicleType,
              driverName:   detail.driverName,
              driverPhone:  detail.driverPhone,
              nextDayPlan:  nextDayPlan(b.refId, detail.pickupDate ?? date),
            }),
          });
        }
      } else if (b.type === 'hotel') {
        const detail = b.detail as HotelDetail;
        if (contact.phone) {
          actions.push({
            icon:  MessageCircle,
            label: 'Hotel Reminder',
            onClick: () => whatsapp.hotelReminder({
              phone:              contact.phone!,
              customerName:       b.customerName,
              hotelName:          detail.hotelName,
              city:               detail.city,
              checkIn:            detail.checkIn,
              checkOut:           detail.checkOut,
              confirmationNumber: detail.confirmationNumber,
            }),
          });
        }
      } else if (b.type === 'flight') {
        const detail = b.detail as FlightDetail;
        if (d <= 1) {
          webCheckinDue = true;
          actions.push({
            icon:  Mail,
            label: 'Web Check-in Reminder',
            onClick: () => gmail.webCheckinReminder({
              customerName: b.customerName,
              bookingId:    b.id,
              airline:      detail.airline,
              flightNumber: detail.flightNumber,
              pnr:          detail.pnr,
              origin:       detail.origin,
              destination:  detail.destination,
              departDate:   detail.departDate,
              departTime:   detail.departTime,
            }),
          });
        }
      }

      items.push({
        id:        `booking-${b.id}`,
        icon:      BIcon,
        iconClass: 'bg-blue-50 text-blue-600',
        title:     `${b.customerName} · ${b.type.charAt(0).toUpperCase() + b.type.slice(1)}`,
        subtitle:  statusCfg.label,
        date,
        daysUntil: d,
        amount:    b.balanceDue > 0 ? b.balanceDue : undefined,
        url:       `/bookings/${b.id}`,
        webCheckinDue,
        actions,
      });
    }

    for (const vp of vendorPayments) {
      if (vp.isPaid || !vp.dueDate) continue;
      const d = daysUntil(vp.dueDate);
      if (d === null || d < 0 || d > 7) continue;
      const trip = vp.tripId ? trips.find(t => t.id === vp.tripId) : undefined;
      items.push({
        id:        `vendor-${vp.id}`,
        icon:      Building2,
        iconClass: 'bg-red-50 text-red-600',
        title:     `${vp.vendorName} — payment due`,
        subtitle:  trip ? `${trip.customer} — ${trip.destination}` : 'Supplier payment',
        date:      vp.dueDate,
        daysUntil: d,
        amount:    vp.outstanding > 0 ? vp.outstanding : undefined,
        url:       '/vendors',
      });
    }

    return items.sort((a, b) => a.daysUntil - b.daysUntil || a.date.localeCompare(b.date));
  }, [stats.departingThisWeek, bookingAlerts, vendorPayments, trips, customers]);

  function dueLabel(days: number): string {
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `in ${days}d`;
  }

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

      {/* ── Due This Week (Daily Ops + Ops Dashboard feed) ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-600" />
              Due This Week
              {dueItems.length > 0 && (
                <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {dueItems.length}
                </span>
              )}
            </CardTitle>
            <button
              onClick={() => navigate('/daily-ops')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              Daily Ops <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-0 pb-3">
          {dueItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              Nothing due in the next 7 days
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {dueItems.map(item => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 py-3 cursor-pointer group hover:bg-gray-50 -mx-3 px-3 rounded-lg transition-colors"
                    onClick={() => navigate(item.url)}
                  >
                    <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', item.iconClass)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{item.title}</p>
                      <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
                      {item.webCheckinDue && (
                        <Badge variant="warning" className="mt-1 text-[10px]">Web Check-in Due</Badge>
                      )}
                    </div>
                    {item.actions && item.actions.length > 0 && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {item.actions.map(action => {
                          const ActionIcon = action.icon;
                          return (
                            <button
                              key={action.label}
                              title={action.label}
                              onClick={(e) => { e.stopPropagation(); action.onClick(); }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                            >
                              <ActionIcon className="w-3.5 h-3.5" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="text-right flex-shrink-0">
                      <p className={cn(
                        'text-xs font-bold',
                        item.daysUntil === 0 ? 'text-red-600' :
                        item.daysUntil === 1 ? 'text-orange-600' : 'text-gray-700'
                      )}>
                        {dueLabel(item.daysUntil)} · {fmtDate(item.date)}
                      </p>
                      {item.amount !== undefined && (
                        <p className="text-xs text-red-500 font-medium">{formatCurrency(item.amount)} due</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── KPI Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Active Trips"
          value={String(stats.activeTrips.length)}
          sub={`${stats.departingThisWeek.length} departing this week`}
          icon={FolderOpen}
          color="blue"
          onClick={() => navigate('/trips')}
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
          title="GST Collected"
          value={formatCurrencyShort(invoiceStats.gstCollected)}
          sub={`This month: ${formatCurrency(invoiceStats.monthlySales)} sales`}
          icon={Percent}
          color="purple"
          onClick={() => navigate('/gst-reports')}
        />
      </div>

      {/* ── Middle Row ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5">

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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

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
              onClick={() => navigate('/analytics')}
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
              onClick={() => navigate('/enquiries')}
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
