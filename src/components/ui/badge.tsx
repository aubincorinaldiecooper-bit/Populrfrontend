import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * The restrained badge vocabulary: a soft tint and a strong word — Live,
 * Draft, Paused, Pending, Unread — never a saturated block. The tints are
 * the token status palette (the same pairs the toasts and the "Needs
 * attention" chip already speak), which retires the bright green/yellow/
 * blue fills the Astryx Badge derived from outside Populr's palette.
 *
 * Not every piece of metadata belongs in a pill. If it isn't a state a
 * creator acts on, it's text.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 text-[12px] font-medium leading-5 whitespace-nowrap',
  {
    variants: {
      variant: {
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        neutral: 'bg-muted text-muted-foreground',
        destructive: 'bg-[#FEE2E2] text-destructive',
        info: 'bg-[#EFF6FF] text-[#3B82F6]',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
