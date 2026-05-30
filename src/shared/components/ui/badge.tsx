import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200/60',
        secondary:   'bg-slate-100 text-slate-600 ring-1 ring-slate-200/60',
        success:     'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/60',
        warning:     'bg-amber-100 text-amber-700 ring-1 ring-amber-200/60',
        destructive: 'bg-red-100 text-red-700 ring-1 ring-red-200/60',
        outline:     'border border-gray-200 text-gray-600 bg-transparent',
        purple:      'bg-violet-100 text-violet-700 ring-1 ring-violet-200/60',
        orange:      'bg-orange-100 text-orange-700 ring-1 ring-orange-200/60',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
