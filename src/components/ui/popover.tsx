import * as React from 'react';
import { Popover as BasePopover } from '@base-ui-components/react/popover';
import { cn } from '@/lib/utils';

/**
 * A floating panel anchored to its trigger — menus with content, not just
 * commands (the header's Inbox and Notifications menus, the builder's invite
 * panel). Base UI positions it, flips it when it would leave the viewport,
 * closes it on Escape and outside click, and returns focus to the trigger.
 *
 * The trigger takes a `render` prop, same as Tooltip:
 *   <PopoverTrigger render={<button aria-label="Notifications">…</button>} />
 */
const Popover = BasePopover.Root;
const PopoverTrigger = BasePopover.Trigger;
const PopoverClose = BasePopover.Close;

const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BasePopover.Popup> & {
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
  }
>(function PopoverContent(
  { side = 'bottom', align = 'end', sideOffset = 8, className, children, ...props },
  ref,
) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner side={side} align={align} sideOffset={sideOffset} className="z-[90]">
        <BasePopover.Popup
          ref={ref}
          className={cn(
            `rounded-xl border border-border bg-card text-foreground shadow-lg outline-none
             transition-[opacity,transform] duration-150
             data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.98]
             data-[ending-style]:opacity-0`,
            className,
          )}
          {...props}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
});

export { Popover, PopoverTrigger, PopoverClose, PopoverContent };
