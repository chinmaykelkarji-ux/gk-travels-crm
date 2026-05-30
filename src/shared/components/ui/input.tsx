import * as React from 'react';
import { cn } from '@/shared/utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-xl border bg-white px-3 py-1 text-sm text-gray-900',
          'border-gray-200 shadow-sm',
          'placeholder:text-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400',
          'hover:border-gray-300',
          'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
          'transition-all duration-150',
          error && 'border-red-400 focus:ring-red-400/30 focus:border-red-400',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
