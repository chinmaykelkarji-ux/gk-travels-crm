import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

interface Props {
  open:        boolean;
  onOpenChange: (open: boolean) => void;
  title:       ReactNode;
  description?: ReactNode;
  children:    ReactNode;
  footer?:     ReactNode;
  width?:      'md' | 'lg' | 'xl';
}

const WIDTH = { md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-2xl' };

/** Right-hand side panel for create/edit forms — keeps the list in view. */
export function Drawer({ open, onOpenChange, title, description, children, footer, width = 'lg' }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 z-40" />
        <Dialog.Content
          className={cn('fixed z-50 inset-y-0 right-0 w-full bg-white shadow-xl flex flex-col focus:outline-none', WIDTH[width])}
          onOpenAutoFocus={e => { const first = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('input, select, textarea, button'); first?.focus(); e.preventDefault(); }}
        >
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900">{title}</Dialog.Title>
              {description && <Dialog.Description className="text-sm text-slate-500 mt-0.5">{description}</Dialog.Description>}
            </div>
            <Dialog.Close className="p-1.5 rounded text-slate-500 hover:bg-slate-100" aria-label="Close">
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
