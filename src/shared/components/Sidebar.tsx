import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, FolderOpen, Ticket, UserCircle,
  IndianRupee, Activity, Settings, X, Plane, Building2,
  FileText, Map, FileCheck, BarChart2, LogOut, Receipt, UsersRound, CalendarClock,
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { useStore, selectors } from '@/store';
import { useAuth } from '@/backend/auth/AuthContext';

interface NavItem {
  path:     string;
  label:    string;
  icon:     React.ElementType;
  badge?:   'reminders';
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'CRM',
    items: [
      { path: '/leads',      label: 'Leads',      icon: Users       },
      { path: '/customers',  label: 'Customers',  icon: UserCircle  },
      { path: '/passengers', label: 'Passengers', icon: UsersRound  },
      { path: '/trips',      label: 'Trips',      icon: FolderOpen  },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { path: '/daily-ops',   label: 'Daily Ops',   icon: CalendarClock },
      { path: '/bookings',    label: 'Bookings',    icon: Ticket        },
      { path: '/quotations',  label: 'Quotations',  icon: FileText      },
      { path: '/itineraries', label: 'Itineraries', icon: Map           },
      { path: '/vouchers',    label: 'Vouchers',    icon: FileCheck     },
      { path: '/operations',  label: 'Operations',  icon: Activity, badge: 'reminders' },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { path: '/finance', label: 'Finance', icon: IndianRupee },
      { path: '/receivables', label: 'Receivables', icon: Receipt },
      { path: '/vendors', label: 'Vendors', icon: Building2   },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { path: '/analytics', label: 'Analytics', icon: BarChart2 },
    ],
  },
];

interface SidebarProps {
  open:    boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pendingReminders = useStore(selectors.pendingReminders).length;
  const { user, signOut } = useAuth();
  const navigate          = useNavigate();

  function getBadgeCount(key?: 'reminders') {
    if (key === 'reminders') return pendingReminders;
    return 0;
  }

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'GK';

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-30 w-60 flex flex-col',
          'transform transition-transform duration-300 ease-in-out lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{
          background:  'linear-gradient(160deg, #0F172A 0%, #1E1B4B 100%)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 flex-shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/20 to-transparent pointer-events-none" />
          <div className="flex items-center gap-3 relative">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)', boxShadow: '0 0 18px rgba(99,102,241,0.4)' }}
            >
              <Plane className="text-white" style={{ width: 15, height: 15 }} />
            </div>
            <div>
              <div className="text-white font-bold text-sm font-display tracking-tight">GK Travels</div>
              <div className="text-indigo-300/70 text-[10px] mt-0.5 font-medium">Operations CRM</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors relative"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <div className="px-3 mb-1.5">
                  <span className="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
                    {group.label}
                  </span>
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ path, label, icon: Icon, badge }) => {
                  const count = getBadgeCount(badge);
                  return (
                    <NavLink
                      key={path}
                      to={path}
                      end={path === '/'}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 relative group',
                          isActive
                            ? 'bg-indigo-500/20 text-indigo-300'
                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-indigo-400" />
                          )}
                          <Icon
                            className={cn(
                              'flex-shrink-0 transition-colors',
                              isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'
                            )}
                            style={{ width: 15, height: 15 }}
                          />
                          <span className="text-[13px]">{label}</span>
                          {count > 0 && (
                            <span className="ml-auto text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                              {count > 99 ? '99+' : count}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Divider */}
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Settings + User footer */}
        <div className="px-3 py-3 space-y-1 flex-shrink-0">
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all',
                isActive ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Settings
                  className={cn('flex-shrink-0', isActive ? 'text-indigo-400' : 'text-slate-500')}
                  style={{ width: 15, height: 15 }}
                />
                Settings
              </>
            )}
          </NavLink>

          <div className="flex items-center gap-3 px-3 py-2 rounded-xl mt-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-slate-200 truncate">{user?.name ?? 'Admin'}</div>
              <div className="text-[10px] text-slate-500 truncate capitalize">{user?.role?.toLowerCase() ?? 'admin'}</div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0"
            >
              <LogOut style={{ width: 13, height: 13 }} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
