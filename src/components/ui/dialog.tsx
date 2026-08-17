import * as React from 'react';
import { Dialog as BaseDialog } from '@base-ui-components/react/dialog';
import { cn } from '@/lib/utils';

/**
 * A centered modal card — Populr's dialog. Base UI owns the modal contract
 * (focus trap and return, Escape, scroll lock, outside-click dismissal);
 * this file owns the look: the white rounded-2xl card every bespoke modal
 * in the app has drawn by hand until now.
 *
 * Persistent dialogs (where dismissing by backdrop would lose something)
 * pass `disablePointerDismissal` on the Root — Escape still works, and is
 * routed through onOpenChange like every other close.
 */
const Dialog = BaseDialog.Root;
const DialogTrigger = BaseDialog.Trigger;
const DialogClose = BaseDialog.Close;

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <BaseDialog.Title
      ref={ref}
      className={cn('font-geist text-xl font-bold text-foreground', className)}
      {...props}
    />
  );
});

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <BaseDialog.Description
      ref={ref}
      className={cn('text-[13px] leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  );
});

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Popup>
>(function DialogContent({ className, children, ...props }, ref) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop
        className="fixed inset-0 z-[70] bg-black/40 transition-opacity duration-200
          data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
      />
      <BaseDialog.Popup
        ref={ref}
        className={cn(
          `fixed left-1/2 top-1/2 z-[80] w-[calc(100vw-2rem)] max-w-[440px]
           -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl
           outline-none transition-[opacity,transform] duration-150
           data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.97]
           data-[ending-style]:opacity-0`,
          className,
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
});

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription };
