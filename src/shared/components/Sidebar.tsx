import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, FolderOpen, Ticket, Contact,
  IndianRupee, Activity, Settings, X, Plane, Building2, FileText, Map, FileCheck, BarChart2,
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { useStore, selectors } from '@/store';

const NAV_ITEMS = [
  { path: '/',           label: 'Dashboard',  icon: LayoutDashboard },
  { path: '/leads',      label: 'Leads',      icon: Users           },
  { path: '/trips',      label: 'Trips',      icon: FolderOpen      },
  { path: '/bookings',   label: 'Bookings',   icon: Ticket          },
  { path: '/customers',  label: 'Customers',  icon: Contact         },
  { path: '/finance',    label: 'Finance',    icon: IndianRupee     },
  { path: '/analytics',  label: 'Analytics',  icon: BarChart2       },
  { path: '/operations', label: 'Operations', icon: Activity        },
  { path: '/vendors',     label: 'Vendors',     icon: Building2 },
  { path: '/quotations',   label: 'Quotations',   icon: FileText  },
  { path: '/itineraries',  label: 'Itineraries',  icon: Map       },
  { path: '/vouchers',     label: 'Vouchers',     icon: FileCheck },
  { path: '/settings',     label: 'Settings',     icon: Settings  },
];

interface SidebarProps {
  open:    boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pendingReminders = useStore(selectors.pendingReminders).length;

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
          'fixed lg:static inset-y-0 left-0 z-30 w-64 flex flex-col',
          'transform transition-transform duration-300 ease-in-out lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{
          background: 'linear-gradient(160deg, #0F172A 0%, #1E1B4B 100%)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Logo / Brand */}
        <div className="flex items-center justify-between gap-3 px-5 py-5 flex-shrink-0 relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/20 to-transparent pointer-events-none" />

          <div className="flex items-center gap-3 relative">
            {/* Icon */}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 relative"
              style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)', boxShadow: '0 0 20px rgba(99,102,241,0.4)' }}>
              <Plane className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <div className="text-white font-bold text-sm font-display tracking-tight">GK Travels</div>
              <div className="text-indigo-300/70 text-[11px] mt-0.5 font-medium">Operations CRM</div>
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
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 relative group',
                  isActive
                    ? 'bg-indigo-500/20 text-indigo-300'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active left bar */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-indigo-400" />
                  )}
                  <Icon className={cn('w-4 h-4 flex-shrink-0 transition-colors', isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300')} />
                  <span>{label}</span>
                  {label === 'Operations' && pendingReminders > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                      {pendingReminders > 99 ? '99+' : pendingReminders}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Divider */}
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* User footer */}
        <div className="px-4 py-4 flex-shrink-0">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors cursor-default">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
              GK
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-200 truncate">Admin</div>
              <div className="text-[11px] text-slate-500 truncate">gktravels.ops</div>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" title="Online" />
          </div>
        </div>
      </aside>
    </>
  );
}
