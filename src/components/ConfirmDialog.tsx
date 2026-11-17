import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          {destructive && (
            <div className="shrink-0 w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3
              id="confirm-dialog-title"
              className="font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]"
            >
              {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5C4D42] dark:text-[#D8CBB8]">
              {message}
            </p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] text-sm font-medium text-[#352820] dark:text-[#F5EFE5] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              destructive
                ? 'bg-red-700 hover:bg-red-800 text-white'
                : 'bg-[#352820] hover:bg-[#49372C] dark:bg-[#B68B54] dark:hover:bg-[#C69C65] text-[#F5EFE5] dark:text-[#18120E]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
