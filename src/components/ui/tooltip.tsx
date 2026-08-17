import * as React from 'react';
import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip';
import { cn } from '@/lib/utils';

/**
 * Tooltip on Base UI — the replacement for bare `title=` attributes.
 * Charcoal chip, small text, no arrow: a label, not a speech bubble.
 *
 *   <TooltipProvider>            ← once, near the root (or per-surface)
 *     <Tooltip>
 *       <TooltipTrigger render={<button …/>} />
 *       <TooltipContent>Pause this automation</TooltipContent>
 *     </Tooltip>
 *   </TooltipProvider>
 */
const TooltipProvider = BaseTooltip.Provider;
const Tooltip = BaseTooltip.Root;
const TooltipTrigger = BaseTooltip.Trigger;

const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseTooltip.Popup> & {
    side?: 'top' | 'bottom' | 'left' | 'right';
    sideOffset?: number;
  }
>(({ className, side = 'top', sideOffset = 6, children, ...props }, ref) => (
  <BaseTooltip.Portal>
    <BaseTooltip.Positioner side={side} sideOffset={sideOffset} className="z-[90]">
      <BaseTooltip.Popup
        ref={ref}
        className={cn(
          `rounded-lg bg-secondary px-2.5 py-1.5 text-[11.5px] font-medium
           text-secondary-foreground shadow-md
           data-[starting-style]:opacity-0 data-[ending-style]:opacity-0
           transition-opacity duration-100`,
          className,
        )}
        {...props}
      >
        {children}
      </BaseTooltip.Popup>
    </BaseTooltip.Positioner>
  </BaseTooltip.Portal>
));
TooltipContent.displayName = 'TooltipContent';

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
