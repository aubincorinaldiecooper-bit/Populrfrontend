import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A standing message about the surface it sits on — the automation whose
 * live behaviour has drifted, the server that can't be reached, the account
 * that needs reconnecting.
 *
 * Not a toast. A toast is for something that just happened and then stops
 * being true; this is for a condition that lasts until it's fixed, so it
 * holds its place in the layout and never disappears on a timer.
 *
 * The palette is the soft-tint vocabulary the badges use — Populr says
 * "attention" with a wash and an icon, not with a saturated fill.
 */
const alertVariants = cva(
  'flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px] leading-relaxed',
  {
    variants: {
      variant: {
        warning: 'border-[#F0D9A8] bg-[#FEF7E6] text-[#7A5A12]',
        destructive: 'border-[#F3C9C2] bg-[#FDF1EF] text-[#8C2F1F]',
        success: 'border-[#D8E9B0] bg-success-soft text-success',
        info: 'border-border bg-muted text-foreground',
      },
    },
    defaultVariants: { variant: 'info' },
  },
);

const icons = {
  warning: AlertTriangle,
  destructive: XCircle,
  success: CheckCircle2,
  info: Info,
} as const;

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Set false where the surrounding layout already carries the meaning. */
  icon?: boolean;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { variant = 'info', icon = true, className, children, ...props },
  ref,
) {
  const Icon = icons[variant ?? 'info'];
  return (
    <div
      ref={ref}
      // Conditions are announced politely: they were already true when the
      // page rendered, and interrupting a screen reader mid-sentence for
      // something that isn't news is the wrong kind of urgent.
      role="status"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {icon && <Icon size={15} className="mt-0.5 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
});

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  function AlertTitle({ className, ...props }, ref) {
    return <p ref={ref} className={cn('font-semibold', className)} {...props} />;
  },
);

export { Alert, AlertTitle, alertVariants };
