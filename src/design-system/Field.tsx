import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/shared/utils/cn';

interface FieldProps {
  label:     ReactNode;
  htmlFor?:  string;
  error?:    string;
  hint?:     ReactNode;
  required?: boolean;
  children:  ReactNode;
  className?: string;
}

/** Label + control + hint/error, laid out consistently across forms. */
export function Field({ label, htmlFor, error, hint, required, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-600">
        {label}{required && <span className="text-red-500 ml-0.5" aria-hidden>*</span>}
      </label>
      {children}
      {error ? <p className="text-xs text-red-600" role="alert">{error}</p> : hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

const control = 'w-full h-9 px-3 text-sm rounded-md border bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ className, invalid, ...rest }, ref) {
    return <input ref={ref} className={cn(control, invalid ? 'border-red-400' : 'border-slate-300', className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, children, ...rest }, ref) {
    return <select ref={ref} className={cn(control, invalid ? 'border-red-400' : 'border-slate-300', className)} {...rest}>{children}</select>;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return <textarea ref={ref} className={cn(control, 'h-auto py-2 min-h-[80px]', invalid ? 'border-red-400' : 'border-slate-300', className)} {...rest} />;
  },
);
