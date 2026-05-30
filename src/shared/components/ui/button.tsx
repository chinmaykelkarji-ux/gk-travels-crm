import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/cn';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium',
    'transition-all duration-150 focus-visible:outline-none',
    'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-500/20 ' +
          'hover:from-indigo-600 hover:to-blue-700 hover:shadow-lg hover:shadow-indigo-500/30',
        destructive:
          'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-md shadow-red-500/20 ' +
          'hover:from-red-600 hover:to-rose-700',
        outline:
          'border border-gray-200 bg-white text-gray-700 shadow-sm ' +
          'hover:bg-gray-50 hover:border-gray-300',
        secondary:
          'bg-gray-100 text-gray-800 hover:bg-gray-200',
        ghost:
          'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        link:
          'text-indigo-600 underline-offset-4 hover:underline p-0 h-auto',
        success:
          'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20 ' +
          'hover:from-emerald-600 hover:to-teal-700',
        warning:
          'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-400/20 ' +
          'hover:from-amber-500 hover:to-orange-600',
      },
      size: {
        default:   'h-9 px-4 py-2',
        sm:        'h-7 px-3 text-xs',
        lg:        'h-11 px-6 text-base',
        icon:      'h-9 w-9',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: {
      variant: 'default',
      size:    'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?:  boolean;
  loading?:  boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin -ml-1 h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
