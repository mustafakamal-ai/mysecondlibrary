import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[#352820] text-[#F5EFE5] dark:bg-[#B68B54] dark:text-[#18120E] font-medium transition-colors hover:opacity-90 whitespace-nowrap shrink-0 min-h-[44px] ${
          compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
        }`}
      >
        <Download className="w-4 h-4" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center justify-center gap-2 rounded-lg border border-[#D8CBB8] dark:border-[#3E3027] text-[#352820] dark:text-[#F5EFE5] font-medium transition-colors hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D] whitespace-nowrap shrink-0 min-h-[44px] ${
            compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 id="ios-install-title" className="font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
                  Install My Library
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close installation guide"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#7C6C5F] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="mt-4 space-y-2 text-sm text-[#5C4D42] dark:text-[#D8CBB8] list-decimal pl-5">
                <li>Tap the Share icon in your Safari toolbar.</li>
                <li>Scroll down and choose Add to Home Screen.</li>
                <li>Open My Library from your Home Screen for offline reading.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full min-h-[44px] rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
