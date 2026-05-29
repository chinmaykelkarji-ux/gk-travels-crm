import * as React from 'react';

interface ConfirmOptions {
  title?:       string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?:  string;
  variant?:     'default' | 'destructive';
}

type ConfirmResolver = (confirmed: boolean) => void;

interface ConfirmState extends ConfirmOptions {
  open:     boolean;
  resolve?: ConfirmResolver;
}

// Global singleton — avoids prop-drilling the confirm dialog
const listeners: Array<(state: ConfirmState) => void> = [];
let memState: ConfirmState = { open: false };

function setConfirmState(state: ConfirmState) {
  memState = state;
  listeners.forEach(l => l(state));
}

export function confirm(opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    setConfirmState({
      open:         true,
      title:        opts.title        ?? 'Are you sure?',
      description:  opts.description,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      cancelLabel:  opts.cancelLabel  ?? 'Cancel',
      variant:      opts.variant      ?? 'default',
      resolve,
    });
  });
}

export function useConfirmState() {
  const [state, setState] = React.useState<ConfirmState>(memState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const idx = listeners.indexOf(setState);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  const handleConfirm = () => {
    state.resolve?.(true);
    setConfirmState({ open: false });
  };

  const handleCancel = () => {
    state.resolve?.(false);
    setConfirmState({ open: false });
  };

  return { state, handleConfirm, handleCancel };
}
