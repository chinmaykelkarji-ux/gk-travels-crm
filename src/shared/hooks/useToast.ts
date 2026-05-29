import * as React from 'react';
import type { ToastVariant } from '@/shared/components/ui/toast';

interface ToastItem {
  id:          string;
  title:       string;
  description?: string;
  variant:     ToastVariant;
  duration?:   number;
  open:        boolean;
}

type ToastAction =
  | { type: 'ADD';    toast: ToastItem }
  | { type: 'REMOVE'; id: string }
  | { type: 'UPDATE'; id: string; toast: Partial<ToastItem> };

interface State { toasts: ToastItem[] }

const TOAST_LIMIT   = 5;
const DEFAULT_DURATION = 4000;

function reducer(state: State, action: ToastAction): State {
  switch (action.type) {
    case 'ADD':
      return { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case 'REMOVE':
      return { toasts: state.toasts.filter(t => t.id !== action.id) };
    case 'UPDATE':
      return {
        toasts: state.toasts.map(t =>
          t.id === action.id ? { ...t, ...action.toast } : t
        ),
      };
    default:
      return state;
  }
}

// Global store for toast state — singleton pattern
const listeners: Array<(state: State) => void> = [];
let memState: State = { toasts: [] };

function dispatch(action: ToastAction) {
  memState = reducer(memState, action);
  listeners.forEach(l => l(memState));
}

let idCounter = 0;

function toast(opts: {
  title:       string;
  description?: string;
  variant?:    ToastVariant;
  duration?:   number;
}) {
  const id       = String(++idCounter);
  const duration = opts.duration ?? DEFAULT_DURATION;

  dispatch({
    type: 'ADD',
    toast: { id, title: opts.title, description: opts.description, variant: opts.variant ?? 'default', duration, open: true },
  });

  if (duration > 0) {
    setTimeout(() => {
      dispatch({ type: 'UPDATE', id, toast: { open: false } });
      setTimeout(() => dispatch({ type: 'REMOVE', id }), 300);
    }, duration);
  }

  return id;
}

toast.success = (title: string, description?: string) =>
  toast({ title, description, variant: 'success' });

toast.error = (title: string, description?: string) =>
  toast({ title, description, variant: 'error', duration: 6000 });

toast.warning = (title: string, description?: string) =>
  toast({ title, description, variant: 'warning' });

toast.info = (title: string, description?: string) =>
  toast({ title, description, variant: 'info' });

export { toast };

export function useToastState() {
  const [state, setState] = React.useState<State>(memState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const idx = listeners.indexOf(setState);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  return {
    toasts:   state.toasts,
    dismiss:  (id: string) => dispatch({ type: 'REMOVE', id }),
  };
}
