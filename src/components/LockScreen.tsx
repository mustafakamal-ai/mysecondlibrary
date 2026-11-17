import React, { useState } from 'react';
import { Lock, Delete, ShieldCheck } from 'lucide-react';
import { verifyPin } from '../utils/crypto';

interface LockScreenProps {
  pinHash: string;
  pinSalt: string;
  onUnlock: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ pinHash, pinSalt, onUnlock }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!pin || checking) return;
    setChecking(true);
    setError(null);
    try {
      const ok = await verifyPin(pin, pinHash, pinSalt);
      if (ok) {
        setPin('');
        onUnlock();
      } else {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
    } finally {
      setChecking(false);
    }
  };

  const appendDigit = (digit: string) => {
    if (pin.length >= 12) return;
    setError(null);
    setPin((prev) => prev + digit);
  };

  const backspace = () => {
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#F5EFE5] dark:bg-[#18120E] px-4 py-8">
      <div className="w-full max-w-sm rounded-3xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] p-7 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="mt-4 font-display text-3xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
            My Library is Locked
          </h1>
          <p className="mt-1.5 text-sm text-[#5C4D42] dark:text-[#D8CBB8]">
            Enter your personal PIN to open your local bookshelf.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6">
          <label htmlFor="library-unlock-pin" className="sr-only">
            Library PIN
          </label>
          <input
            id="library-unlock-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => {
              setError(null);
              setPin(e.target.value);
            }}
            placeholder="Enter PIN"
            className="w-full text-center tracking-[0.35em] font-mono-tabular text-lg min-h-[48px] px-4 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-[#352820] dark:text-[#F5EFE5] focus:outline-none focus:ring-2 focus:ring-[#B68B54]"
          />

          {error && (
            <p role="alert" className="mt-2.5 text-center text-xs font-medium text-red-700 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => appendDigit(digit)}
                className="min-h-[48px] rounded-xl bg-[#F5EFE5] dark:bg-[#2E241D] hover:bg-[#EBE1D2] dark:hover:bg-[#3A2E25] text-base font-medium font-mono-tabular text-[#352820] dark:text-[#F5EFE5] transition-colors"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={backspace}
              aria-label="Backspace"
              className="min-h-[48px] rounded-xl bg-[#F5EFE5] dark:bg-[#2E241D] hover:bg-[#EBE1D2] dark:hover:bg-[#3A2E25] flex items-center justify-center text-[#5C4D42] dark:text-[#D8CBB8] transition-colors"
            >
              <Delete className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => appendDigit('0')}
              className="min-h-[48px] rounded-xl bg-[#F5EFE5] dark:bg-[#2E241D] hover:bg-[#EBE1D2] dark:hover:bg-[#3A2E25] text-base font-medium font-mono-tabular text-[#352820] dark:text-[#F5EFE5] transition-colors"
            >
              0
            </button>
            <button
              type="submit"
              disabled={pin.length === 0 || checking}
              className="min-h-[48px] rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-sm font-medium disabled:opacity-45 hover:opacity-90 transition-opacity"
            >
              {checking ? '...' : 'Unlock'}
            </button>
          </div>
        </form>

        <div className="mt-5 pt-4 border-t border-[#DFD2C0] dark:border-[#3E3027] flex items-start gap-2 text-xs text-[#7C6C5F] dark:text-[#A69684]">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-[#B68B54]" />
          <span>
            PIN lock guards screen access locally on this browser. Use encrypted ZIP backups in Settings for strong AES-256 archive encryption.
          </span>
        </div>
      </div>
    </div>
  );
};
