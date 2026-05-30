import { Mail } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

interface GmailButtonProps {
  email:    string;
  onClick:  () => void;
  size?:    'sm' | 'md';
  label?:   string;
  className?: string;
}

/** Red Gmail button — opens a pre-filled Gmail compose window */
export function GmailButton({ email, onClick, size = 'sm', label, className }: GmailButtonProps) {
  if (!email) return null;
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={`Send email to ${email}`}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-lg transition-all duration-150',
        'text-[#EA4335] bg-red-50 hover:bg-[#EA4335] hover:text-white',
        'border border-red-100 hover:border-[#EA4335]',
        'active:scale-[0.97]',
        size === 'sm'  ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
        className
      )}
    >
      {/* Official Gmail "M" icon shape */}
      <svg viewBox="0 0 20 20" className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} fill="currentColor">
        <path d="M2 4.5A2.5 2.5 0 014.5 2h11A2.5 2.5 0 0118 4.5v11a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 012 15.5V4.5zM10 11.5L4 7v8.5A.5.5 0 004.5 16h11a.5.5 0 00.5-.5V7l-6 4.5zm5.9-7H4.1L10 8.5l5.9-4z"/>
      </svg>
      {label ?? email}
    </button>
  );
}

/** Compact icon-only version — use inside table cells */
export function GmailIcon({ email, onClick, className }: Omit<GmailButtonProps, 'size' | 'label'>) {
  if (!email) return null;
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={`Send email to ${email}`}
      className={cn(
        'p-1.5 rounded-lg transition-all duration-150',
        'text-[#EA4335] hover:bg-[#EA4335] hover:text-white',
        'active:scale-[0.97]',
        className
      )}
    >
      <Mail className="w-3.5 h-3.5" />
    </button>
  );
}
