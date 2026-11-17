import React from 'react';
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'error';
  text: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)]"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg border text-sm ${
            toast.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/90 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100'
              : toast.type === 'success'
                ? 'bg-[#352820] dark:bg-[#2E241D] border-[#B68B54]/40 text-[#F5EFE5]'
                : 'bg-[#FFFDF9] dark:bg-[#231B16] border-[#DFD2C0] dark:border-[#3E3027] text-[#292929] dark:text-[#F5EFE5]'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
          ) : toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#B68B54]" />
          ) : (
            <Info className="w-4 h-4 shrink-0 text-[#B68B54]" />
          )}
          <span className="flex-1 leading-snug">{toast.text}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="p-1 rounded-md opacity-70 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
