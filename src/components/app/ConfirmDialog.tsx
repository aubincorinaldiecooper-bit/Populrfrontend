import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

/**
 * The one shape every "are you sure" in the app takes: a question, the
 * consequence in plain words, a quiet way out, and one deliberate button.
 * Replaces window.confirm — which froze the whole tab and wore the
 * browser's face — with Populr's own, keyboard and screen-reader included
 * (Base UI renders alertdialog semantics; Escape is the cancel path).
 *
 * Controlled by the caller: open it with the thing being confirmed in
 * state, and run the action from onConfirm. The dialog closes itself
 * either way.
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** Deletion-red action button; false for consequential-but-not-destructive asks. */
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel render={<Button variant="ghost">Cancel</Button>} />
          <Button
            variant={destructive ? 'destructive' : 'secondary'}
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
