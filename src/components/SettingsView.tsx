import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  HardDrive,
  Lock,
  Moon,
  ShieldAlert,
  Sun,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  clearAllLibraryData,
  getStorageEstimate,
  requestPersistentStorage,
  updateSettings,
} from '../db/libraryDb';
import {
  exportLibraryBackup,
  inspectBackupArchive,
  restoreParsedBackup,
  type ParsedBackupArchive,
} from '../services/backupService';
import type { AppSettings, ReadingMode } from '../types/library';
import { hashPin, verifyPin } from '../utils/crypto';
import { formatBytes } from '../utils/libraryLogic';
import { ConfirmDialog } from './ConfirmDialog';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  settings: AppSettings;
  onSettingsChanged: (next: AppSettings) => void;
  onLibraryChanged: () => void;
  onLockNow: () => void;
  onNotify: (type: 'success' | 'info' | 'error', text: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSettingsChanged,
  onLibraryChanged,
  onLockNow,
  onNotify,
}) => {
  const importInputRef = useRef<HTMLInputElement>(null);

  const [storageInfo, setStorageInfo] = useState<{
    usage: number;
    quota: number;
    persisted: boolean;
    supported: boolean;
  }>({ usage: 0, quota: 0, persisted: false, supported: true });

  // Security PIN form state
  const [pinMode, setPinMode] = useState<'idle' | 'setup' | 'change' | 'disable'>('idle');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Backup Export / Import state
  const [encryptBackup, setEncryptBackup] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [backupProgress, setBackupProgress] = useState<{ percent: number; stage: string } | null>(null);

  // Import inspection state
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [needsImportPassphrase, setNeedsImportPassphrase] = useState(false);
  const [importPassphrase, setImportPassphrase] = useState('');
  const [parsedRestore, setParsedRestore] = useState<ParsedBackupArchive | null>(null);

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const refreshStorage = async () => {
    const est = await getStorageEstimate();
    setStorageInfo(est);
  };

  useEffect(() => {
    void refreshStorage();
  }, []);

  const handleThemeChange = async (theme: 'light' | 'dark') => {
    const next = await updateSettings((prev) => ({ ...prev, theme }));
    onSettingsChanged(next);
  };

  const handleReadingModeChange = async (readingMode: ReadingMode) => {
    const next = await updateSettings((prev) => ({ ...prev, readingMode }));
    onSettingsChanged(next);
  };

  const handleDefaultZoomChange = async (defaultZoom: number) => {
    const next = await updateSettings((prev) => ({ ...prev, defaultZoom }));
    onSettingsChanged(next);
  };

  const handleAutoLockChange = async (autoLockMinutes: number) => {
    const next = await updateSettings((prev) => ({
      ...prev,
      security: { ...prev.security, autoLockMinutes },
    }));
    onSettingsChanged(next);
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);

    if (pinMode === 'change' || pinMode === 'disable') {
      if (!settings.security.pinHash || !settings.security.pinSalt) return;
      const validCurrent = await verifyPin(
        currentPin,
        settings.security.pinHash,
        settings.security.pinSalt
      );
      if (!validCurrent) {
        setPinError('Current PIN is incorrect.');
        return;
      }
    }

    if (pinMode === 'disable') {
      const next = await updateSettings((prev) => ({
        ...prev,
        security: {
          ...prev.security,
          lockEnabled: false,
          pinHash: null,
          pinSalt: null,
        },
      }));
      onSettingsChanged(next);
      setPinMode('idle');
      setCurrentPin('');
      onNotify('info', 'Library PIN lock disabled.');
      return;
    }

    if (newPin.length < 4) {
      setPinError('PIN must be at least 4 digits or characters.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('PIN entries do not match.');
      return;
    }

    const { hash, salt } = await hashPin(newPin);
    const next = await updateSettings((prev) => ({
      ...prev,
      security: {
        ...prev.security,
        lockEnabled: true,
        pinHash: hash,
        pinSalt: salt,
      },
    }));
    onSettingsChanged(next);
    setPinMode('idle');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    onNotify('success', 'Library PIN lock saved.');
  };

  const handleExportBackup = async () => {
    if (encryptBackup && exportPassphrase.trim().length < 4) {
      onNotify('error', 'Enter an encryption passphrase of at least 4 characters.');
      return;
    }
    try {
      setBackupProgress({ percent: 5, stage: 'Preparing backup...' });
      const result = await exportLibraryBackup({
        encryptionPassphrase: encryptBackup ? exportPassphrase.trim() : undefined,
        onProgress: (percent, stage) => setBackupProgress({ percent, stage }),
      });

      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);

      setExportPassphrase('');
      onNotify(
        'success',
        result.encrypted
          ? 'Encrypted library backup downloaded.'
          : 'Library ZIP backup downloaded.'
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to export backup.');
    } finally {
      setBackupProgress(null);
    }
  };

  const handleInspectImport = async (file: File, passphrase?: string) => {
    try {
      setBackupProgress({ percent: 15, stage: 'Inspecting backup archive...' });
      const res = await inspectBackupArchive(file, passphrase);
      if (res.status === 'needs_passphrase') {
        setPendingImportFile(file);
        setNeedsImportPassphrase(true);
        setBackupProgress(null);
        return;
      }
      setNeedsImportPassphrase(false);
      setPendingImportFile(null);
      setImportPassphrase('');
      setParsedRestore(res.parsed);
      setBackupProgress(null);
    } catch (err) {
      setBackupProgress(null);
      onNotify('error', err instanceof Error ? err.message : 'Invalid backup file.');
    }
  };

  const handleExecuteRestore = async (overwriteDuplicates: boolean) => {
    if (!parsedRestore) return;
    const archive = parsedRestore;
    setParsedRestore(null);
    try {
      const result = await restoreParsedBackup(archive, {
        overwriteDuplicates,
        onProgress: (percent, stage) => setBackupProgress({ percent, stage }),
      });
      onLibraryChanged();
      await refreshStorage();
      onNotify(
        'success',
        `Restored ${result.restoredBooks} book${result.restoredBooks === 1 ? '' : 's'}${
          result.skippedDuplicates > 0 ? ` (${result.skippedDuplicates} duplicates skipped)` : ''
        }.`
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setBackupProgress(null);
    }
  };

  const handleClearLibrary = async () => {
    setShowClearConfirm(false);
    await clearAllLibraryData();
    onLibraryChanged();
    await refreshStorage();
    onNotify('info', 'All local books, progress, and bookmarks have been cleared.');
  };

  const usagePercent =
    storageInfo.quota > 0
      ? Math.min(100, Math.round((storageInfo.usage / storageInfo.quota) * 100))
      : 0;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#DFD2C0] dark:border-[#3E3027]">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
            Settings
          </h1>
          <p className="mt-1 text-sm text-[#5C4D42] dark:text-[#D8CBB8]">
            Customize reading preferences, local privacy, device storage, and offline backups.
          </p>
        </div>
        <PWAInstallButton />
      </div>

      {/* Appearance & Reader Preferences */}
      <section className="rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] p-5 sm:p-6 space-y-6">
        <h2 className="font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
          Appearance & Reading Room
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[#352820] dark:text-[#F5EFE5]">Theme</p>
            <p className="text-xs text-[#7C6C5F] dark:text-[#A69684]">
              Warm Cream daylight paper or Deep Walnut evening mode
            </p>
          </div>
          <div className="inline-flex rounded-xl bg-[#EBE1D2] dark:bg-[#2E241D] p-1 self-start">
            <button
              type="button"
              onClick={() => handleThemeChange('light')}
              className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg text-xs font-medium transition-colors ${
                settings.theme === 'light'
                  ? 'bg-[#FFFDF9] text-[#352820] shadow-xs'
                  : 'text-[#5C4D42] dark:text-[#D8CBB8]'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange('dark')}
              className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg text-xs font-medium transition-colors ${
                settings.theme === 'dark'
                  ? 'bg-[#18120E] text-[#F5EFE5] shadow-xs'
                  : 'text-[#5C4D42] dark:text-[#D8CBB8]'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Dark</span>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-[#DFD2C0] dark:border-[#3E3027] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[#352820] dark:text-[#F5EFE5]">
              Default Reading Mode
            </p>
            <p className="text-xs text-[#7C6C5F] dark:text-[#A69684]">
              Auto uses single-page on mobile portrait and 2-page spread on wider screens
            </p>
          </div>
          <select
            aria-label="Default reading mode"
            value={settings.readingMode}
            onChange={(e) => handleReadingModeChange(e.target.value as ReadingMode)}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-sm"
          >
            <option value="auto">Auto (Responsive)</option>
            <option value="single">Single Page</option>
            <option value="double">Double Page Spread</option>
          </select>
        </div>

        <div className="pt-4 border-t border-[#DFD2C0] dark:border-[#3E3027] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[#352820] dark:text-[#F5EFE5]">Default Zoom</p>
            <p className="text-xs text-[#7C6C5F] dark:text-[#A69684]">
              Initial scale applied when opening a book
            </p>
          </div>
          <select
            aria-label="Default zoom"
            value={settings.defaultZoom}
            onChange={(e) => handleDefaultZoomChange(Number(e.target.value))}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-sm font-mono-tabular"
          >
            <option value={0.85}>85%</option>
            <option value={1}>100%</option>
            <option value={1.15}>115%</option>
            <option value={1.3}>130%</option>
          </select>
        </div>
      </section>

      {/* Privacy & Application Lock */}
      <section className="rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
              Privacy & Library Lock
            </h2>
            <p className="text-xs text-[#7C6C5F] dark:text-[#A69684]">
              Protect casual access to your library with a local PIN and auto-lock timer.
            </p>
          </div>
          {settings.security.lockEnabled && (
            <button
              type="button"
              onClick={onLockNow}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-xs font-medium"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock Library Now</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!settings.security.lockEnabled ? (
            <button
              type="button"
              onClick={() => {
                setPinMode('setup');
                setPinError(null);
              }}
              className="min-h-[44px] px-4 rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] text-sm font-medium hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D]"
            >
              Set Library PIN
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setPinMode('change');
                  setPinError(null);
                }}
                className="min-h-[44px] px-4 rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] text-sm font-medium hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D]"
              >
                Change PIN
              </button>
              <button
                type="button"
                onClick={() => {
                  setPinMode('disable');
                  setPinError(null);
                }}
                className="min-h-[44px] px-4 rounded-xl border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 text-sm font-medium"
              >
                Disable Lock
              </button>
            </>
          )}

          {settings.security.lockEnabled && (
            <div className="ml-auto flex items-center gap-2">
              <label htmlFor="auto-lock-select" className="text-xs text-[#7C6C5F] dark:text-[#A69684]">
                Auto-lock:
              </label>
              <select
                id="auto-lock-select"
                value={settings.security.autoLockMinutes}
                onChange={(e) => handleAutoLockChange(Number(e.target.value))}
                className="min-h-[40px] px-3 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-xs"
              >
                <option value={0}>Never</option>
                <option value={1}>After 1 min</option>
                <option value={5}>After 5 min</option>
                <option value={15}>After 15 min</option>
                <option value={30}>After 30 min</option>
              </select>
            </div>
          )}
        </div>

        {pinMode !== 'idle' && (
          <form
            onSubmit={handlePinSubmit}
            className="p-4 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] space-y-3 max-w-md"
          >
            {(pinMode === 'change' || pinMode === 'disable') && (
              <div>
                <label className="block text-xs font-medium mb-1">Current PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  required
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-lg bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] text-sm"
                />
              </div>
            )}

            {pinMode !== 'disable' && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1">New PIN (min 4 characters)</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    required
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-lg bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Confirm New PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    required
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-lg bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] text-sm"
                  />
                </div>
              </>
            )}

            {pinError && (
              <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                {pinError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                className="min-h-[40px] px-4 rounded-lg bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-xs font-medium"
              >
                {pinMode === 'disable' ? 'Confirm Disable' : 'Save PIN'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPinMode('idle');
                  setPinError(null);
                }}
                className="min-h-[40px] px-4 rounded-lg border border-[#DFD2C0] dark:border-[#3E3027] text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <p className="text-xs text-[#7C6C5F] dark:text-[#A69684]">
          Note: A local PIN lock uses PBKDF2 verification to guard the app screen on this browser. It does not encrypt raw IndexedDB files against forensic device inspection—for full cryptographic protection, export an AES-256 encrypted backup below.
        </p>
      </section>

      {/* Local Storage Monitoring */}
      <section className="rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-5 h-5 text-[#B68B54]" />
            <h2 className="font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
              Device Storage Usage
            </h2>
          </div>
          {!storageInfo.persisted && storageInfo.supported && (
            <button
              type="button"
              onClick={async () => {
                const ok = await requestPersistentStorage();
                await refreshStorage();
                onNotify(
                  ok ? 'success' : 'info',
                  ok
                    ? 'Browser persistent storage granted.'
                    : 'Persistent storage request was deferred by the browser.'
                );
              }}
              className="min-h-[38px] px-3 rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] text-xs font-medium hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D]"
            >
              Protect Against Auto-Eviction
            </button>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono-tabular text-[#5C4D42] dark:text-[#D8CBB8]">
            <span>Used: {formatBytes(storageInfo.usage)}</span>
            <span>
              Quota: {storageInfo.quota > 0 ? formatBytes(storageInfo.quota) : 'Unavailable'} (
              {usagePercent}%)
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-[#EBE1D2] dark:bg-[#2E241D] overflow-hidden">
            <div className="h-full bg-[#B68B54]" style={{ width: `${usagePercent}%` }} />
          </div>
          <p className="text-xs text-[#7C6C5F] dark:text-[#A69684]">
            Persistence mode:{' '}
            <strong className="font-medium text-[#352820] dark:text-[#F5EFE5]">
              {storageInfo.persisted ? 'Persistent Storage Granted' : 'Best-Effort Browser Storage'}
            </strong>
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Clearing browser site data or uninstalling your browser may permanently erase your local library if you have not exported a backup archive.
          </span>
        </div>
      </section>

      {/* Backup & Restore */}
      <section className="rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
            Backup & Restore (Offline Archive)
          </h2>
          <p className="mt-1 text-xs text-[#7C6C5F] dark:text-[#A69684]">
            Export every PDF, cover, category, bookmark, and reading position into a portable archive.
          </p>
        </div>

        {backupProgress && (
          <div className="p-3.5 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span>{backupProgress.stage}</span>
              <span className="font-mono-tabular">{backupProgress.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-[#EBE1D2] dark:bg-[#2E241D] overflow-hidden">
              <div
                className="h-full bg-[#B68B54] transition-all"
                style={{ width: `${backupProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        <div className="space-y-3 p-4 rounded-xl bg-[#F5EFE5]/70 dark:bg-[#18120E]/60 border border-[#DFD2C0] dark:border-[#3E3027]">
          <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={encryptBackup}
              onChange={(e) => setEncryptBackup(e.target.checked)}
              className="w-4 h-4 accent-[#B68B54]"
            />
            <span>Encrypt backup with AES-256-GCM passphrase</span>
          </label>

          {encryptBackup && (
            <div className="space-y-2 pt-1">
              <input
                type="password"
                value={exportPassphrase}
                onChange={(e) => setExportPassphrase(e.target.value)}
                placeholder="Enter encryption passphrase (min 4 characters)"
                className="w-full max-w-md min-h-[42px] px-3 rounded-xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] text-sm"
              />
              <p className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Important: Passphrases are never stored or recoverable. Forgetting your encryption passphrase will make this encrypted backup permanently unrecoverable.
                </span>
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              disabled={Boolean(backupProgress)}
              onClick={handleExportBackup}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-sm font-medium disabled:opacity-50"
            >
              <Archive className="w-4 h-4" />
              <span>Export Library Backup</span>
            </button>

            <input
              ref={importInputRef}
              type="file"
              accept=".zip,.enc,.mylibrary.enc,application/zip"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void handleInspectImport(file);
                }
                e.target.value = '';
              }}
              className="hidden"
            />

            <button
              type="button"
              disabled={Boolean(backupProgress)}
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] bg-[#FFFDF9] dark:bg-[#231B16] text-sm font-medium hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D]"
            >
              <UploadCloud className="w-4 h-4 text-[#B68B54]" />
              <span>Import Library Backup</span>
            </button>
          </div>
        </div>

        {/* Encrypted Import Passphrase Prompt */}
        {needsImportPassphrase && pendingImportFile && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleInspectImport(pendingImportFile, importPassphrase);
            }}
            className="p-4 rounded-xl border border-[#B68B54] bg-[#F5EFE5] dark:bg-[#18120E] space-y-3"
          >
            <p className="text-sm font-medium">
              Enter passphrase to decrypt &ldquo;{pendingImportFile.name}&rdquo;
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="password"
                required
                value={importPassphrase}
                onChange={(e) => setImportPassphrase(e.target.value)}
                placeholder="Backup passphrase"
                className="flex-1 min-w-[200px] min-h-[42px] px-3 rounded-xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] text-sm"
              />
              <button
                type="submit"
                className="min-h-[42px] px-4 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-xs font-medium"
              >
                Decrypt & Inspect
              </button>
              <button
                type="button"
                onClick={() => {
                  setNeedsImportPassphrase(false);
                  setPendingImportFile(null);
                }}
                className="min-h-[42px] px-3 rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Parsed Restore Confirmation */}
        {parsedRestore && (
          <div className="p-4 rounded-xl border border-[#B68B54] bg-[#F5EFE5] dark:bg-[#18120E] space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#352820] dark:text-[#F5EFE5]">
              <CheckCircle2 className="w-4 h-4 text-[#B68B54]" />
              <span>
                Backup Verified (Manifest v{parsedRestore.manifest.manifestVersion})
              </span>
            </div>
            <p className="text-xs text-[#5C4D42] dark:text-[#D8CBB8]">
              Found {parsedRestore.manifest.bookCount} books ({parsedRestore.newBookCount} new,{' '}
              {parsedRestore.duplicateBookIds.length} already in library),{' '}
              {parsedRestore.manifest.bookmarks.length} bookmarks, and{' '}
              {parsedRestore.manifest.categories.length} categories.
            </p>
            <div className="flex flex-wrap gap-2">
              {parsedRestore.duplicateBookIds.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleExecuteRestore(false)}
                    className="min-h-[40px] px-4 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-xs font-medium"
                  >
                    Restore New Only (Skip Duplicates)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExecuteRestore(true)}
                    className="min-h-[40px] px-4 rounded-xl border border-[#B68B54] text-xs font-medium"
                  >
                    Overwrite Existing Records
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => handleExecuteRestore(false)}
                  className="min-h-[40px] px-4 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-xs font-medium"
                >
                  Restore Library Now
                </button>
              )}
              <button
                type="button"
                onClick={() => setParsedRestore(null)}
                className="min-h-[40px] px-3 rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Danger Zone: Clear Library */}
      <section className="rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-red-200 dark:border-red-900/50 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-red-800 dark:text-red-300">
            Clear Library Data
          </h2>
          <p className="mt-1 text-xs text-[#5C4D42] dark:text-[#D8CBB8]">
            Permanently delete all local PDFs, covers, bookmarks, and reading history from this browser.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowClearConfirm(true)}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-red-700 hover:bg-red-800 text-white text-sm font-medium shrink-0"
        >
          <Trash2 className="w-4 h-4" />
          <span>Clear All Data</span>
        </button>
      </section>

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear Entire Library?"
        message="This will permanently erase every imported PDF book, reading progress record, bookmark, and custom category stored on this device. Export a ZIP backup first if you want to keep your collection."
        confirmLabel="Yes, Erase Everything"
        destructive
        onConfirm={handleClearLibrary}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
};
