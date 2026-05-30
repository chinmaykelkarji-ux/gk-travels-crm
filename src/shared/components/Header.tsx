import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Bell, Plus, ChevronDown, Search, FolderPlus, UserPlus } from 'lucide-react';
import { useStore, selectors } from '@/store';
import { Button } from './ui/button';
import { cn } from '@/shared/utils/cn';
import { fmtDate, daysUntil } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';

const ROUTE_META: Record<string, { title: string; subtitle: string }> = {
  '/':           { title: 'Dashboard',   subtitle: 'Operations Overview' },
  '/leads':      { title: 'Leads',       subtitle: 'Sales Pipeline' },
  '/trips':      { title: 'Trips',       subtitle: 'Trip Files & Management' },
  '/bookings':   { title: 'Bookings',    subtitle: 'Flights · Hotels · Visas · Services' },
  '/customers':  { title: 'Customers',   subtitle: 'Profiles · History · Preferences' },
  '/finance':    { title: 'Finance',     subtitle: 'Revenue · Costs · Gross Margin' },
  '/analytics':  { title: 'Analytics',   subtitle: 'Profit Intelligence · Business Analytics' },
  '/operations': { title: 'Operations',  subtitle: 'Tasks · Reminders · Alerts' },
  '/vendors':     { title: 'Vendors',     subtitle: 'Suppliers · Costs · Payments'            },
  '/quotations':   { title: 'Quotations',   subtitle: 'Proposals · Pricing · Conversion'     },
  '/itineraries':  { title: 'Itineraries',  subtitle: 'Day-wise Plans · Hotels · Activities'      },
  '/vouchers':     { title: 'Vouchers',     subtitle: 'Hotel · Transfer · Activity · Flight'     },
  '/settings':     { title: 'Settings',     subtitle: 'Company · Integrations · Users'            },
};

interface HeaderProps {
  onMenuToggle: () => void;
  onNewTrip:    () => void;
}

export function Header({ onMenuToggle, onNewTrip }: HeaderProps) {
  const location         = useLocation();
  const navigate         = useNavigate();
  const pendingReminders = useStore(selectors.pendingReminders);
  const trips            = useStore(s => s.trips);
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const meta = ROUTE_META[location.pathname] ?? { title: 'GK Travels', subtitle: '' };

  const urgentTrips = trips.filter(t => {
    const days = daysUntil(t.departure);
    return days !== null && days >= 0 && days <= 7 && (t.balanceDue ?? 0) > 0;
  });

  return (
    <header
      className="flex items-center justify-between px-5 py-3 flex-shrink-0 z-10"
      style={{
        background:   'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(226,232,240,0.8)',
        boxShadow:    '0 1px 12px rgba(15,23,42,0.06)',
      }}
    >
      {/* Left: Menu + breadcrumb title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-bold text-[15px] text-gray-900 font-display leading-tight">{meta.title}</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">{meta.subtitle}</p>
        </div>
      </div>

      {/* Right: Search · Bell · Quick Add */}
      <div className="flex items-center gap-2">

        {/* Search */}
        <div className="hidden sm:flex items-center gap-2 rounded-xl px-3 py-2 w-52 lg:w-64 bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors">
          <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search trips, customers…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-gray-600 outline-none w-full placeholder:text-slate-400"
          />
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="relative p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <Bell className="w-[18px] h-[18px]" />
            {pendingReminders.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm">
                {pendingReminders.length > 99 ? '99+' : pendingReminders.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div
                className="absolute right-0 top-full mt-2 w-80 rounded-2xl z-20 overflow-hidden animate-slide-up"
                style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 20px 60px rgba(15,23,42,0.14)' }}
              >
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between"
                  style={{ background: 'linear-gradient(135deg, #EEF2FF 0%, #F0FDF4 100%)' }}>
                  <div className="flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="text-sm font-semibold text-gray-900">Alerts & Reminders</span>
                  </div>
                  {pendingReminders.length > 0 && (
                    <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                      {pendingReminders.length} pending
                    </span>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                  {pendingReminders.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Bell className="w-5 h-5 text-emerald-500" />
                      </div>
                      <p className="text-xs text-gray-500 font-medium">All clear — no pending alerts</p>
                    </div>
                  ) : (
                    pendingReminders.slice(0, 8).map(r => (
                      <div
                        key={r.id}
                        className={cn(
                          'px-4 py-3 text-xs cursor-pointer hover:bg-gray-50 transition-colors',
                          r.priority === 'urgent' && 'border-l-2 border-red-400',
                          r.priority === 'high'   && 'border-l-2 border-orange-400',
                        )}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={cn(
                            'inline-block w-1.5 h-1.5 rounded-full',
                            r.priority === 'urgent' ? 'bg-red-500' :
                            r.priority === 'high'   ? 'bg-orange-500' :
                            r.priority === 'medium' ? 'bg-amber-400' : 'bg-gray-400',
                          )} />
                          <span className={cn(
                            'font-semibold text-[10px] uppercase tracking-wide',
                            r.priority === 'urgent' ? 'text-red-600' :
                            r.priority === 'high'   ? 'text-orange-600' : 'text-gray-500',
                          )}>{r.priority}</span>
                        </div>
                        <p className="text-gray-700 leading-snug">{r.message}</p>
                        <p className="text-gray-400 mt-1">{fmtDate(r.dueDate)}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/60">
                  <button
                    onClick={() => { navigate('/operations'); setNotifOpen(false); }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 w-full text-center"
                  >
                    View all reminders →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Quick Add split button */}
        <div className="relative flex">
          <Button size="sm" onClick={onNewTrip} className="rounded-r-none gap-1.5 pr-3">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Trip</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setQuickOpen(o => !o)}
            className="rounded-l-none border-l border-indigo-400/40 px-2"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>

          {quickOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setQuickOpen(false)} />
              <div
                className="absolute right-0 top-full mt-2 w-52 rounded-xl overflow-hidden z-20 animate-slide-up"
                style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 12px 32px rgba(15,23,42,0.12)' }}
              >
                {[
                  { label: 'New Trip File', icon: FolderPlus, color: 'text-indigo-600 bg-indigo-50', action: () => { onNewTrip(); setQuickOpen(false); } },
                  { label: 'New Lead',      icon: UserPlus,  color: 'text-emerald-600 bg-emerald-50', action: () => { navigate('/leads'); setQuickOpen(false); } },
                ].map(({ label, icon: Icon, color, action }) => (
                  <button
                    key={label}
                    onClick={action}
                    className="w-full text-left px-4 py-3 text-sm flex items-center gap-3 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', color)}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
