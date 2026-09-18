import { useEffect, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';

interface ToolbarProps { children?: ReactNode; right?: ReactNode }

export function Toolbar({ children, right }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-5 py-3">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{children}</div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

interface SearchProps {
  value:        string;
  onChange:     (value: string) => void;
  placeholder?: string;
  /** Debounce before onChange fires (ms). */
  delay?:       number;
  autoFocus?:   boolean;
}

export function SearchInput({ value, onChange, placeholder = 'Search…', delay = 250, autoFocus }: SearchProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft), delay);
    return () => clearTimeout(t);
  }, [draft, value, delay, onChange]);

  return (
    <div className="relative w-full sm:w-72">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        type="search"
        value={draft}
        autoFocus={autoFocus}
        onChange={e => setDraft(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 pl-8 pr-8 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      />
      {draft && (
        <button type="button" aria-label="Clear search" onClick={() => { setDraft(''); onChange(''); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
