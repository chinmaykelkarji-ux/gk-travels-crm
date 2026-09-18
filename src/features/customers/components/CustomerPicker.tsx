import { useState } from 'react';
import { SearchInput } from '@/design-system';
import { formatPhone } from '@/shared/calc/phone';
import { useCustomerList } from '../hooks';
import type { CustomerSummary } from '@/shared/contracts/customers';

/** Search-and-pick a customer (used by merge, relationships, and later enquiries/quotes). */
export function CustomerPicker({ excludeId, onPick }: { excludeId?: string; onPick: (c: CustomerSummary) => void }) {
  const [q, setQ] = useState('');
  const list = useCustomerList({ q: q || undefined, pageSize: 10, sort: q ? 'name' : 'recent' });
  const rows = (list.data?.items ?? []).filter(c => c.id !== excludeId);
  return (
    <div className="space-y-2">
      <SearchInput value={q} onChange={setQ} placeholder="Search by name, phone, email or ID" autoFocus />
      <ul className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-80 overflow-y-auto">
        {list.isPending && <li className="px-3 py-2 text-sm text-slate-500">Searching…</li>}
        {!list.isPending && rows.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matches.</li>}
        {rows.map(c => (
          <li key={c.id}>
            <button type="button" onClick={() => onPick(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none">
              <div className="font-medium text-slate-900">{c.name} <span className="text-xs text-slate-500">{c.id}</span></div>
              <div className="text-xs text-slate-500">{formatPhone(c.phone)}{c.email ? ` · ${c.email}` : ''}{c.tripCount ? ` · ${c.tripCount} trip${c.tripCount > 1 ? 's' : ''}` : ''}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
