import * as React from 'react';
import { cn } from '@/lib/utils';

/** Field label in the `type-label` role. Plain <label> on purpose — the
 *  htmlFor/id contract is the accessibility, no primitive needed. */
const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'block text-xs font-medium text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = 'Label';

export { Label };
