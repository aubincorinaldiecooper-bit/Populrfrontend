import { useApp } from '../context/AppContext';
import { Check, AlertCircle, Info, X } from 'lucide-react';

const iconMap = {
  success: Check,
  error: AlertCircle,
  info: Info,
};

const colorMap = {
  success: 'bg-[#E0F5E9] text-[#059669] border-[#A7F3D0]',
  error: 'bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]',
  info: 'bg-[#EFF6FF] text-[#3B82F6] border-[#BFDBFE]',
};

export default function ToastContainer() {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-20 right-4 md:top-4 z-[100] space-y-2 max-w-[calc(100vw-2rem)]"
    >
      {toasts.map(toast => {
        const Icon = iconMap[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg min-w-[280px] max-w-[400px] animate-fade-in ${colorMap[toast.type]}`}
          >
            <Icon size={16} className="flex-shrink-0" />
            <p className="text-[13px] font-medium flex-1">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className="flex-shrink-0 -mr-1.5 p-1.5 rounded-lg hover:opacity-70 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
