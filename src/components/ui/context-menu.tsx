import * as React from 'react';
import { ContextMenu as BaseContextMenu } from '@base-ui-components/react/context-menu';
import { cn } from '@/lib/utils';

/**
 * The menu a right-click opens, on the thing it was aimed at.
 *
 * Same parts and the same look as DropdownMenu — it IS Base UI's menu,
 * positioned at the pointer instead of at a trigger — so a step's commands
 * read identically whether they were reached by right-clicking the step or
 * by opening a kebab. Long-press opens it on touch, which is the only way
 * these commands exist on a phone.
 *
 * The trigger is an area, not a button:
 *   <ContextMenu>
 *     <ContextMenuTrigger>{card}</ContextMenuTrigger>
 *     <ContextMenuContent>…</ContextMenuContent>
 *   </ContextMenu>
 */
const ContextMenu = BaseContextMenu.Root;
const ContextMenuTrigger = BaseContextMenu.Trigger;
const ContextMenuGroup = BaseContextMenu.Group;

const ContextMenuContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseContextMenu.Popup>
>(function ContextMenuContent({ className, children, ...props }, ref) {
  return (
    <BaseContextMenu.Portal>
      <BaseContextMenu.Positioner className="z-[90]">
        <BaseContextMenu.Popup
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
        </BaseContextMenu.Popup>
      </BaseContextMenu.Positioner>
    </BaseContextMenu.Portal>
  );
});

const ContextMenuItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseContextMenu.Item> & { destructive?: boolean }
>(function ContextMenuItem({ destructive = false, className, ...props }, ref) {
  return (
    <BaseContextMenu.Item
      ref={ref}
      className={cn(
        `flex w-full cursor-default select-none items-center gap-2.5 px-3 py-2
         text-[13px] outline-none data-[highlighted]:bg-muted`,
        destructive
          ? 'text-destructive data-[highlighted]:bg-destructive/10'
          : 'text-foreground',
        className,
      )}
      {...props}
    />
  );
});

/** A quiet heading above a group — "Add a step", not a command itself. */
const ContextMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseContextMenu.GroupLabel>
>(function ContextMenuLabel({ className, ...props }, ref) {
  return (
    <BaseContextMenu.GroupLabel
      ref={ref}
      className={cn(
        'px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
});

const ContextMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseContextMenu.Separator>
>(function ContextMenuSeparator({ className, ...props }, ref) {
  return (
    <BaseContextMenu.Separator
      ref={ref}
      className={cn('my-1 h-px bg-border-subtle', className)}
      {...props}
    />
  );
});

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuGroup,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
};
