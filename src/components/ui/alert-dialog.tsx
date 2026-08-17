import * as React from 'react';
import { AlertDialog as BaseAlertDialog } from '@base-ui-components/react/alert-dialog';
import { cn } from '@/lib/utils';

/**
 * The interruption that must be answered — reserved for destructive or
 * hard-to-reverse actions (deleting a live automation, disconnecting an
 * account). Anything softer belongs in a Dialog or inline.
 *
 * Base UI renders role=alertdialog and never dismisses on outside click;
 * Escape maps to the cancel path. This file replaces the window.confirm
 * calls, which blocked the whole tab and drew the browser's chrome instead
 * of Populr's.
 */
const AlertDialog = BaseAlertDialog.Root;
const AlertDialogTrigger = BaseAlertDialog.Trigger;
const AlertDialogCancel = BaseAlertDialog.Close;

const AlertDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Title>
>(function AlertDialogTitle({ className, ...props }, ref) {
  return (
    <BaseAlertDialog.Title
      ref={ref}
      className={cn('font-geist text-[17px] font-bold text-foreground', className)}
      {...props}
    />
  );
});

const AlertDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Description>
>(function AlertDialogDescription({ className, ...props }, ref) {
  return (
    <BaseAlertDialog.Description
      ref={ref}
      className={cn('mt-2 text-[13px] leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  );
});

const AlertDialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Popup>
>(function AlertDialogContent({ className, children, ...props }, ref) {
  return (
    <BaseAlertDialog.Portal>
      <BaseAlertDialog.Backdrop
        className="fixed inset-0 z-[70] bg-black/40 transition-opacity duration-200
          data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
      />
      <BaseAlertDialog.Popup
        ref={ref}
        className={cn(
          `fixed left-1/2 top-1/2 z-[80] w-[calc(100vw-2rem)] max-w-[400px]
           -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl
           outline-none transition-[opacity,transform] duration-150
           data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.97]
           data-[ending-style]:opacity-0`,
          className,
        )}
        {...props}
      >
        {children}
      </BaseAlertDialog.Popup>
    </BaseAlertDialog.Portal>
  );
});

/** The buttons row: cancel quiet on the left of the action, action carries the weight. */
function AlertDialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mt-5 flex justify-end gap-2', className)}>{children}</div>;
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
};
