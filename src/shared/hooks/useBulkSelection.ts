import { useState, useCallback, useEffect } from 'react';

export function useBulkSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Drop selected ids that no longer exist in the current list (e.g. after a delete or filter change).
  useEffect(() => {
    setSelected(prev => {
      const idSet = new Set(ids);
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (idSet.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [ids]);

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = ids.length > 0 && ids.every(id => selected.has(id));

  const toggleAll = useCallback(() => {
    setSelected(prev => {
      const everySelected = ids.length > 0 && ids.every(id => prev.has(id));
      if (everySelected) {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, [ids]);

  const clear = useCallback(() => setSelected(new Set()), []);

  return { selected, toggle, toggleAll, allSelected, clear, count: selected.size };
}
