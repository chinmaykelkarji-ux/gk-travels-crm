import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Bell, Plus, ChevronDown, Search, FolderPlus, UserPlus, Ticket } from 'lucide-react';
import { useStore, selectors } from '@/store';
import { Button } from './ui/button';
import { cn } from '@/shared/utils/cn';
import { fmtDate, daysUntilLabel, daysUntil } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';

const ROUTE_META: Record<string, { title: string; subtitle: string }> = {
  '/':           { title: 'Dashboard',   subtitle: 'Operations Overview' },
  '/leads':      { title: 'Leads',       subtitle: 'Sales Pipeline' },
  '/trips':      { title: 'Trips',       subtitle: 'Trip Files & Management' },
  '/bookings':   { title: 'Bookings',    subtitle: 'Flights · Hotels · Visas · Services' },
  '/customers':  { title: 'Customers',   subtitle: 'Profiles · History · Preferences' },
  '/finance':    { title: 'Finance',     subtitle: 'Revenue · Costs · Gross Margin' },
  '/operations': { title: 'Operations',  subtitle: 'Tasks · Reminders · Alerts' },
  '/settings':   { title: 'Settings',    subtitle: 'Company · Integrations · Users' },
};

interface HeaderProps {
  onMenuToggle: () => void;
  onNewTrip:    () => void;
}

export function Header({ onMenuToggle, onNewTrip }: HeaderProps) {
  const location          = useLocation();
  const navigate          = useNavigate();
  const pendingReminders  = useStore(selectors.pendingReminders);
  const [notifOpen, setNotifOpen]   = useState(false);
  const [quickOpen, setQuickOpen]   = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const trips             = useStore(s => s.trips);

  const meta = ROUTE_META[location.pathname] ?? { title: 'GK Travels', subtitle: '' };

  // Upcoming trips alert
  const urgentTrips = trips.filter(t => {
    const days = daysUntil(t.departure);
    return days !== null && days >= 0 && days <= 7 && (t.balanceDue ?? 0) > 0;
  });

  return (
    <header
      className="flex items-center justify-between px-5 py-3 flex-shrink-0 z-10"
      style={{ background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}
    >
      {/* Left: Menu + Title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-bold text-[15px] text-gray-900 font-display leading-tight">{meta.title}</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">{meta.subtitle}</p>
        </div>
      </div>

      {/* Right: Search + Notifications + Quick Add */}
      <div className="flex items-center gap-2">
        {/* Search (hidden on mobile) */}
        <div className="hidden sm:flex items-center gap-2 rounded-lg px-3 py-2 w-56 lg:w-72 bg-gray-50 border border-gray-200">
          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search trips, customers, PNR…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-gray-600 outline-none w-full placeholder:text-gray-400"
          />
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <Bell className="w-4.5 h-4.5 w-[18px] h-[18px]" />
            {pendingReminders.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                {pendingReminders.length > 99 ? '99+' : pendingReminders.length}
              </span>
            )}
          </button>

          {/* Notification panel */}
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div
                className="absolute right-0 top-full mt-2 w-80 rounded-2xl z-20 overflow-hidden"
                style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 16px 48px rgba(15,23,42,0.14)' }}
              >
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-sm font-semibold text-gray-900">Alerts & Reminders</span>
                  </div>
                  <span className="text-xs text-gray-400">{pendingReminders.length} pending</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {pendingReminders.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                      <p className="text-xs text-gray-400">No pending alerts</p>
                    </div>
                  ) : (
                    pendingReminders.slice(0, 10).map(r => (
                      <div
                        key={r.id}
                        className={cn(
                          'px-4 py-3 border-b border-gray-50 text-xs',
                          r.priority === 'urgent' && 'bg-red-50',
                          r.priority === 'high'   && 'bg-orange-50',
                        )}
                      >
                        <p className={cn(
                          'font-medium text-gray-800',
                          r.priority === 'urgent' && 'text-red-700',
                        )}>{r.message}</p>
                        <p className="text-gray-400 mt-0.5">{fmtDate(r.dueDate)}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                  <button
                    onClick={() => { navigate('/operations'); setNotifOpen(false); }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 w-full text-center"
                  >
                    View all reminders →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Quick Add */}
        <div className="relative flex">
          <Button size="sm" onClick={onNewTrip} className="rounded-r-none gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Trip</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setQuickOpen(o => !o)}
            className="rounded-l-none border-l border-blue-500 px-2"
          >
            <ChevronDown className="w-3 h-3" />
          </Button>

          {quickOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setQuickOpen(false)} />
              <div
                className="absolute right-0 top-full mt-2 w-52 rounded-xl overflow-hidden z-20"
                style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}
              >
                <button
                  onClick={() => { onNewTrip(); setQuickOpen(false); }}
                  className="w-full text-left px-4 py-3 text-sm flex items-center gap-3 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <FolderPlus className="w-4 h-4 text-blue-600" /> New Trip File
                </button>
                <button
                  onClick={() => { navigate('/leads'); setQuickOpen(false); }}
                  className="w-full text-left px-4 py-3 text-sm flex items-center gap-3 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <UserPlus className="w-4 h-4 text-emerald-600" /> New Lead
                </button>
                <button
                  onClick={() => { navigate('/bookings'); setQuickOpen(false); }}
                  className="w-full text-left px-4 py-3 text-sm flex items-center gap-3 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Ticket className="w-4 h-4 text-purple-600" /> New Booking
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
