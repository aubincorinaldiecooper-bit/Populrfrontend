import * as React from 'react';
import { Dialog as BaseDialog } from '@base-ui-components/react/dialog';
import { cn } from '@/lib/utils';

/**
 * A panel that slides in from an edge — Populr's drawer. Built on Base UI's
 * Dialog, which owns everything the old hand-rolled drawers had to fake:
 * focus is trapped while open and returned to the trigger on close, Escape
 * closes, the page behind stops scrolling, and the scrim click dismisses.
 *
 * Motion is plain CSS transitions driven by Base UI's data-[starting-style]/
 * data-[ending-style] attributes, so the global prefers-reduced-motion rule
 * in index.css collapses it with no per-component wiring.
 *
 * Usage:
 *   <Sheet open={open} onOpenChange={setOpen}>
 *     <SheetContent side="left" aria-label="Main menu">…</SheetContent>
 *   </Sheet>
 */
const Sheet = BaseDialog.Root;
const SheetTrigger = BaseDialog.Trigger;
const SheetClose = BaseDialog.Close;
const SheetTitle = BaseDialog.Title;

const sides = {
  left: 'inset-y-0 left-0 h-full border-r data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full',
  right: 'inset-y-0 right-0 h-full border-l data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full',
  bottom: 'inset-x-0 bottom-0 w-full border-t data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full',
} as const;

const SheetContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Popup> & { side?: keyof typeof sides }
>(function SheetContent({ side = 'left', className, children, ...props }, ref) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop
        className="fixed inset-0 z-[45] bg-black/30 transition-opacity duration-200
          data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
      />
      <BaseDialog.Popup
        ref={ref}
        className={cn(
          `fixed z-[50] bg-sidebar border-sidebar-border outline-none
           transition-transform duration-300 ease-[cubic-bezier(0.24,1,0.4,1)]`,
          sides[side],
          className,
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
});

export { Sheet, SheetTrigger, SheetClose, SheetTitle, SheetContent };
