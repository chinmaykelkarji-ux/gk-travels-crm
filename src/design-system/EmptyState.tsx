import type { ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';

interface Props { title: string; description?: ReactNode; action?: ReactNode; icon?: LucideIcon; compact?: boolean }

export function EmptyState({ title, description, action, icon: Icon = Inbox, compact }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-6' : 'py-14'}`}>
      <div className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-slate-400" />
      </div>
      <h3 className="text-sm font-medium text-slate-700">{title}</h3>
      {description && <p className="text-xs text-slate-500 max-w-xs mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
