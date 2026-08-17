import * as React from 'react';
import { cn } from '@/lib/utils';

/** Text input in Populr's form geometry (the pop-input contract): white
 *  field, hairline border, lime focus treatment via the global focus rule. */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        `w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm
         text-foreground placeholder:text-foreground-subtle transition-all
         disabled:cursor-not-allowed disabled:opacity-60`,
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
