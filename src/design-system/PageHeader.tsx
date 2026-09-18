import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface Crumb { label: string; to?: string }

interface Props {
  title:        ReactNode;
  subtitle?:    ReactNode;
  crumbs?:      Crumb[];
  actions?:     ReactNode;
  /** Small inline badge next to the title (status, record number). */
  badge?:       ReactNode;
}

export function PageHeader({ title, subtitle, crumbs, actions, badge }: Props) {
  return (
    <div className="px-5 pt-4 pb-3 border-b border-slate-200 bg-white">
      {crumbs && crumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-slate-500 mb-1" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {c.to ? <Link to={c.to} className="hover:text-slate-800">{c.label}</Link> : <span>{c.label}</span>}
              {i < crumbs.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300" />}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-lg font-semibold text-slate-900 truncate">{title}</h1>
            {badge}
          </div>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
