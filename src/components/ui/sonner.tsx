import { Toaster as SonnerToaster } from 'sonner';
import { Check, AlertCircle, Info } from 'lucide-react';

/**
 * Populr's toast surface, rendered by Sonner. This replaces the hand-rolled
 * ToastContainer: Sonner owns stacking, timing, pausing on hover, swipe
 * dismissal and the aria-live region; Populr owns the look — the same
 * tinted cards the old renderer drew, one per type.
 *
 * Nothing calls Sonner directly from feature code: AppContext.showToast is
 * still the one door (it keeps its signature, including the action/Undo
 * option), so a later change of toast engine stays a one-file affair.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      offset={16}
      mobileOffset={{ top: 80 }}
      gap={8}
      visibleToasts={4}
      closeButton
      icons={{
        success: <Check size={16} />,
        error: <AlertCircle size={16} />,
        info: <Info size={16} />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex items-center gap-3 w-[356px] max-w-[calc(100vw-2rem)] px-4 py-3 rounded-xl border shadow-lg text-[13px] font-medium',
          title: 'flex-1 font-medium',
          success: 'bg-success-soft text-success border-[#A7F3D0]',
          error: 'bg-[#FEE2E2] text-destructive border-[#FECACA]',
          info: 'bg-[#EFF6FF] text-[#3B82F6] border-[#BFDBFE]',
          actionButton:
            '!bg-transparent !text-current text-[12px] font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity',
          closeButton:
            '!bg-transparent !text-current !border-none opacity-60 hover:opacity-100 transition-opacity',
        },
      }}
    />
  );
}
