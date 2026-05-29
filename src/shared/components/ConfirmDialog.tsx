import { AlertTriangle } from 'lucide-react';
import { useConfirmState } from '@/shared/hooks/useConfirm';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';

export function ConfirmDialog() {
  const { state, handleConfirm, handleCancel } = useConfirmState();

  return (
    <Dialog open={state.open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {state.variant === 'destructive' && (
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
            )}
            <div>
              <DialogTitle>{state.title}</DialogTitle>
              {state.description && (
                <DialogDescription>{state.description}</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            {state.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant={state.variant === 'destructive' ? 'destructive' : 'default'}
            size="sm"
            onClick={handleConfirm}
          >
            {state.confirmLabel ?? 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
