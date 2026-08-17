import * as React from 'react';
import { Menu as BaseMenu } from '@base-ui-components/react/menu';
import { cn } from '@/lib/utils';

/**
 * A menu of commands hanging off a trigger — the kebabs and pickers the app
 * has hand-rolled per component until now. Base UI supplies what those
 * versions each faked a subset of: arrow-key movement, typeahead, Escape,
 * outside-click close, focus return to the trigger, and real menu/menuitem
 * roles.
 *
 * The trigger takes a `render` prop like every Base UI trigger here:
 *   <DropdownMenuTrigger render={<button aria-label="More">…</button>} />
 */
const DropdownMenu = BaseMenu.Root;
const DropdownMenuTrigger = BaseMenu.Trigger;
const DropdownMenuGroup = BaseMenu.Group;

const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.Popup> & {
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
  }
>(function DropdownMenuContent(
  { side = 'bottom', align = 'end', sideOffset = 4, className, children, ...props },
  ref,
) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner side={side} align={align} sideOffset={sideOffset} className="z-[90]">
        <BaseMenu.Popup
          ref={ref}
          className={cn(
            `min-w-[176px] overflow-hidden rounded-xl border border-border bg-card py-1
             text-foreground shadow-lg outline-none
             transition-[opacity,transform] duration-100
             data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.98]
             data-[ending-style]:opacity-0`,
            className,
          )}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
});

const DropdownMenuItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.Item> & { destructive?: boolean }
>(function DropdownMenuItem({ destructive = false, className, ...props }, ref) {
  return (
    <BaseMenu.Item
      ref={ref}
      className={cn(
        `flex w-full cursor-default select-none items-center gap-2.5 px-3 py-2
         text-left text-[13px] outline-none transition-colors
         data-[disabled]:pointer-events-none data-[disabled]:opacity-50`,
        destructive
          ? 'text-destructive data-[highlighted]:bg-[#FEF2F2]'
          : 'text-foreground data-[highlighted]:bg-muted',
        className,
      )}
      {...props}
    />
  );
});

const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <BaseMenu.Separator
      ref={ref}
      className={cn('my-1 h-px bg-border-subtle', className)}
      {...props}
    />
  );
});

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
};
