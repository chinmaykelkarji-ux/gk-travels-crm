import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-blue-100 text-blue-700',
        secondary:   'bg-gray-100 text-gray-700',
        success:     'bg-emerald-100 text-emerald-700',
        warning:     'bg-yellow-100 text-yellow-700',
        destructive: 'bg-red-100 text-red-700',
        outline:     'border border-gray-200 text-gray-700 bg-transparent',
        purple:      'bg-purple-100 text-purple-700',
        orange:      'bg-orange-100 text-orange-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
