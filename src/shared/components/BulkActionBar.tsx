import { Trash2, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

interface BulkActionBarProps {
  count:     number;
  itemLabel: string;
  onClear:   () => void;
  onDelete:  () => void;
  deleting?: boolean;
}

export function BulkActionBar({ count, itemLabel, onClear, onDelete, deleting }: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 animate-fade-in">
      <span className="text-xs font-semibold text-indigo-700">
        {count} {itemLabel}{count === 1 ? '' : 's'} selected
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onClear}>
          <X className="w-3.5 h-3.5 mr-1" /> Clear
        </Button>
        <Button size="sm" variant="destructive" onClick={onDelete} loading={deleting}>
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete Selected
        </Button>
      </div>
    </div>
  );
}
