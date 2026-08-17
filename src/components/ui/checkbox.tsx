import * as React from 'react';
import { Checkbox as BaseCheckbox } from '@base-ui-components/react/checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Checkbox on Base UI: real keyboard/ARIA behavior from the primitive,
 * Populr's checked treatment on top — the lime box with a charcoal check
 * the Team page's permission rows established.
 */
const Checkbox = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseCheckbox.Root>
>(({ className, ...props }, ref) => (
  <BaseCheckbox.Root
    ref={ref}
    className={cn(
      `flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border
       border-border-strong bg-card transition-colors
       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chartreuse/50
       focus-visible:ring-offset-2 focus-visible:ring-offset-cream
       data-[checked]:border-primary data-[checked]:bg-primary
       disabled:cursor-not-allowed disabled:opacity-60`,
      className,
    )}
    {...props}
  >
    <BaseCheckbox.Indicator className="flex items-center justify-center data-[unchecked]:hidden">
      <Check size={11} strokeWidth={3} className="text-primary-foreground" />
    </BaseCheckbox.Indicator>
  </BaseCheckbox.Root>
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };
