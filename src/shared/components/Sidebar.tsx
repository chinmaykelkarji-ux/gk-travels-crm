import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, FolderOpen, Ticket, Contact,
  IndianRupee, Activity, Settings, Bell, X,
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { useStore, selectors } from '@/store';
import { Badge } from './ui/badge';

const NAV_ITEMS = [
  { path: '/',           label: 'Dashboard',  icon: LayoutDashboard },
  { path: '/leads',      label: 'Leads',      icon: Users           },
  { path: '/trips',      label: 'Trips',      icon: FolderOpen      },
  { path: '/bookings',   label: 'Bookings',   icon: Ticket          },
  { path: '/customers',  label: 'Customers',  icon: Contact         },
  { path: '/finance',    label: 'Finance',    icon: IndianRupee     },
  { path: '/operations', label: 'Operations', icon: Activity        },
  { path: '/settings',   label: 'Settings',   icon: Settings        },
];

interface SidebarProps {
  open:     boolean;
  onClose:  () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pendingReminders = useStore(selectors.pendingReminders).length;

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-30 w-64 flex flex-col',
          'transform transition-transform duration-300 ease-in-out',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ background: '#0F172A', borderRight: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Logo */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-[18px] flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-600">
              <span className="text-white font-bold text-[13px] font-display tracking-wide">GK</span>
            </div>
            <div>
              <div className="text-[#F1F5F9] font-bold text-sm font-display tracking-tight">GK Travels</div>
              <div className="text-[#475569] text-[11px] mt-0.5">Operations CRM</div>
            </div>
          </div>

          {/* Mobile close */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

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
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                )
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{label}</span>
              {label === 'Operations' && pendingReminders > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {pendingReminders > 99 ? '99+' : pendingReminders}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div
          className="px-4 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600/25 flex items-center justify-center text-xs font-bold text-blue-400 flex-shrink-0">
              GK
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-200 truncate">Admin</div>
              <div className="text-[11px] text-slate-500 truncate">gktravels.ops</div>
            </div>
            <Bell className="w-4 h-4 text-slate-500" />
          </div>
        </div>
      </aside>
    </>
  );
}
