import { Select } from '@/design-system';
import type { VendorKind } from '@/shared/contracts/masters';
import { useVendors } from '../hooks';

interface Props {
  id?:       string;
  value:     string | null | undefined;
  onChange:  (vendorId: string | null) => void;
  /** Kinds listed first; others still selectable. */
  kinds?:    VendorKind[];
  invalid?:  boolean;
  placeholder?: string;
}

/** Vendor dropdown from the v2 master (active vendors, preferred kinds first). */
export function VendorSelect({ id, value, onChange, kinds, invalid, placeholder = '— none —' }: Props) {
  const q = useVendors({ pageSize: 200 });
  const rows = q.data?.items ?? [];
  const preferred = kinds ? rows.filter(v => kinds.includes(v.kind)) : rows;
  const others = kinds ? rows.filter(v => !kinds.includes(v.kind)) : [];
  return (
    <Select id={id} value={value ?? ''} invalid={invalid} onChange={e => onChange(e.target.value || null)}>
      <option value="">{q.isPending ? 'Loading…' : placeholder}</option>
      {preferred.map(v => <option key={v.id} value={v.id}>{v.name}{v.city ? ` · ${v.city}` : ''}</option>)}
      {others.length > 0 && <optgroup label="Other vendors">{others.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>}
    </Select>
  );
}
