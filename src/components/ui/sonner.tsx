import { Toaster as SonnerToaster } from 'sonner';
import { Check, AlertCircle, Info } from 'lucide-react';

/**
 * Populr's toast surface, rendered by Sonner. This replaces the hand-rolled
 * ToastContainer: Sonner owns stacking, timing, pausing on hover, swipe
 * dismissal and the aria-live region; Populr owns the look — the same
 * tinted cards the old renderer drew, one per type.
 *
 * `unstyled` strips Sonner's structural rules along with its skin, so the
 * classNames below rebuild the layout, not just the colors: the content
 * block grows (`flex-1`) so trailing controls stay trailing, and the close
 * button — which Sonner renders as the toast's FIRST child in the DOM — is
 * sent to the trailing edge with `order-last` and given a real padded hit
 * target instead of its bare 16px icon.
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
      // Sonner applies this below its own fixed 600px breakpoint. The bar
      // it must clear is 4rem plus the device's safe-area inset (see
      // Sidebar's mobile top bar), so the offset is that expression, not a
      // hardcoded pixel guess. The 601–767px seam — where Sonner is back on
      // `offset` but the bar is still visible — is bridged in index.css.
      mobileOffset={{ top: 'calc(4rem + env(safe-area-inset-top) + 0.75rem)' }}
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
          icon: 'shrink-0',
          content: 'flex-1 min-w-0',
          title: 'font-medium',
          description: 'mt-0.5 font-normal opacity-80',
          success: 'bg-success-soft text-success border-[#A7F3D0]',
          error: 'bg-[#FEE2E2] text-destructive border-[#FECACA]',
          info: 'bg-[#EFF6FF] text-[#3B82F6] border-[#BFDBFE]',
          actionButton:
            'shrink-0 !bg-transparent !text-current text-[12px] font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity',
          closeButton:
            'order-last -mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg !bg-transparent !text-current !border-none opacity-60 hover:opacity-100 transition-opacity',
        },
      }}
    />
  );
}
