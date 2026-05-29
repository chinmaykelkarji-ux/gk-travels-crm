import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

const ToastProvider = ToastPrimitive.Provider;
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      'fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:max-w-[380px]',
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

const toastVariantConfig: Record<ToastVariant, { icon: React.ElementType; className: string }> = {
  default: { icon: Info,         className: 'border-gray-200 bg-white' },
  success: { icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50' },
  error:   { icon: XCircle,      className: 'border-red-200 bg-red-50' },
  warning: { icon: AlertTriangle, className: 'border-yellow-200 bg-yellow-50' },
  info:    { icon: Info,         className: 'border-blue-200 bg-blue-50' },
};

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> & { variant?: ToastVariant }
>(({ className, variant = 'default', ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(
      'group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border p-4 shadow-lg',
      'transition-all',
      'data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
      'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[swipe=end]:animate-out data-[state=closed]:fade-out-80',
      'data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-bottom-full',
      toastVariantConfig[variant].className,
      className
    )}
    {...props}
  />
));
Toast.displayName = ToastPrimitive.Root.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      'absolute right-2 top-2 rounded-md p-1 text-gray-400 opacity-0 transition-opacity',
      'hover:text-gray-600 focus:opacity-100 focus:outline-none group-hover:opacity-100',
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitive.Close>
));
ToastClose.displayName = ToastPrimitive.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn('text-sm font-semibold text-gray-900', className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn('text-xs text-gray-600 mt-0.5', className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

// Composite toast with icon
function ToastWithIcon({
  variant = 'default',
  title,
  description,
  ...props
}: {
  variant?: ToastVariant;
  title: string;
  description?: string;
} & React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root>) {
  const { icon: Icon } = toastVariantConfig[variant];
  return (
    <Toast variant={variant} {...props}>
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0 text-current" />
      <div className="flex-1 min-w-0">
        <ToastTitle>{title}</ToastTitle>
        {description && <ToastDescription>{description}</ToastDescription>}
      </div>
      <ToastClose />
    </Toast>
  );
}

export {
  ToastProvider, ToastViewport, Toast, ToastClose, ToastTitle, ToastDescription, ToastWithIcon,
};
