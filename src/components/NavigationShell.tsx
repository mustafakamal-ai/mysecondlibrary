import React from 'react';
import {
  BookMarked,
  BookOpen,
  FolderKanban,
  Heart,
  Home,
  Library,
  Lock,
  Moon,
  Plus,
  Settings,
  Sun,
  WifiOff,
} from 'lucide-react';
import type { NavigationSection, ThemeMode } from '../types/library';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { PWAInstallButton } from './PWAInstallButton';

interface NavigationShellProps {
  activeSection: NavigationSection;
  theme: ThemeMode;
  lockEnabled: boolean;
  onNavigate: (section: NavigationSection) => void;
  onToggleTheme: () => void;
  onLockNow: () => void;
  onOpenUpload: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: NavigationSection; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: Home },
  { id: 'my-books', label: 'My Books', shortLabel: 'Books', icon: Library },
  { id: 'continue-reading', label: 'Continue Reading', shortLabel: 'Reading', icon: BookOpen },
  { id: 'favorites', label: 'Favorites', shortLabel: 'Favorites', icon: Heart },
  { id: 'categories', label: 'Categories', shortLabel: 'Shelves', icon: FolderKanban },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
];

export const NavigationShell: React.FC<NavigationShellProps> = ({
  activeSection,
  theme,
  lockEnabled,
  onNavigate,
  onToggleTheme,
  onLockNow,
  onOpenUpload,
  children,
}) => {
  const isOnline = useOnlineStatus();

  return (
    <div className="min-h-dvh flex flex-col md:flex-row bg-[#F5EFE5] dark:bg-[#18120E] text-[#292929] dark:text-[#F5EFE5]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 lg:w-72 shrink-0 flex-col border-r border-[#DFD2C0] dark:border-[#3E3027] bg-[#FAF6EF] dark:bg-[#1E1712] sticky top-0 h-dvh">
        <div className="px-6 py-6 border-b border-[#DFD2C0] dark:border-[#3E3027] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] flex items-center justify-center shrink-0">
            <BookMarked className="w-5 h-5" />
          </div>
          <span className="font-display text-2xl font-semibold tracking-tight text-[#352820] dark:text-[#F5EFE5] whitespace-nowrap">
            My Library
          </span>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E]'
                    : 'text-[#5C4D42] dark:text-[#D8CBB8] hover:bg-[#EBE1D2]/80 dark:hover:bg-[#2E241D]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#DFD2C0] dark:border-[#3E3027] space-y-2.5">
          <button
            type="button"
            onClick={onOpenUpload}
            className="w-full min-h-[44px] px-4 rounded-xl bg-[#B68B54] text-[#18120E] text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            <span>Import PDF Books</span>
          </button>

          <PWAInstallButton />

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              className="min-h-[40px] px-3 rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] text-xs font-medium flex items-center gap-1.5 text-[#5C4D42] dark:text-[#D8CBB8] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D]"
            >
              {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
              <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
            </button>

            {lockEnabled && (
              <button
                type="button"
                onClick={onLockNow}
                aria-label="Lock library"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] text-[#B68B54] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D]"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Compact Header (< 54px) */}
      <header className="md:hidden sticky top-0 z-30 h-13 px-4 bg-[#FAF6EF]/92 dark:bg-[#1E1712]/92 backdrop-blur-md border-b border-[#DFD2C0] dark:border-[#3E3027] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] flex items-center justify-center shrink-0">
            <BookMarked className="w-4 h-4" />
          </div>
          <span className="font-display text-xl font-semibold text-[#352820] dark:text-[#F5EFE5] truncate">
            My Library
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#5C4D42] dark:text-[#D8CBB8]"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onOpenUpload}
            aria-label="Import PDF book"
            className="min-h-[40px] px-3 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-xs font-medium inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>
        </div>
      </header>

      {/* Main Content Scroll Canvas */}
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-6 pb-24 md:pb-10 max-w-7xl w-full mx-auto">
        {!isOnline && (
          <div className="mb-5 px-4 py-2.5 rounded-xl bg-[#EBE1D2] dark:bg-[#2E241D] border border-[#DFD2C0] dark:border-[#3E3027] flex items-center gap-2 text-xs text-[#5C4D42] dark:text-[#D8CBB8]">
            <WifiOff className="w-4 h-4 text-[#B68B54] shrink-0" />
            <span>Offline Mode — Your local library and PDFs remain fully accessible.</span>
          </div>
        )}
        {children}
      </main>

      {/* Mobile Bottom Navigation (Compact <= 60px, total sticky < 15% mobile viewport) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FAF6EF]/95 dark:bg-[#1E1712]/95 backdrop-blur-md border-t border-[#DFD2C0] dark:border-[#3E3027] pb-safe"
      >
        <div className="grid grid-cols-6 h-14 items-center">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={`h-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active
                    ? 'text-[#352820] dark:text-[#C99E67] font-semibold'
                    : 'text-[#7C6C5F] dark:text-[#A69684]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] tracking-tight truncate max-w-full px-0.5">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
