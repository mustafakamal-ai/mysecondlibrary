import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  db,
  deleteBookSafely,
  requestPersistentStorage,
  toggleBookFavorite,
  updateSettings,
} from './db/libraryDb';
import { initializeLibraryWithStarterBooks } from './services/starterLibraryService';
import type {
  AppSettings,
  BookRecord,
  CategoryRecord,
  NavigationSection,
  ReadingProgressRecord,
} from './types/library';
import { computeLibraryStats, createDefaultSettings } from './utils/libraryLogic';
import { NavigationShell } from './components/NavigationShell';
import { DashboardView } from './components/DashboardView';
import { MyBooksView } from './components/MyBooksView';
import { ContinueReadingView } from './components/ContinueReadingView';
import { FavoritesView } from './components/FavoritesView';
import { CategoriesView } from './components/CategoriesView';
import { SettingsView } from './components/SettingsView';
import { UploadModal } from './components/UploadModal';
import { BookMetadataModal } from './components/BookMetadataModal';
import { BookReader } from './components/BookReader';
import { LockScreen } from './components/LockScreen';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ToastContainer, type ToastMessage } from './components/Toast';

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const [books, setBooks] = useState<BookRecord[]>([]);
  const [progressList, setProgressList] = useState<ReadingProgressRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(createDefaultSettings);

  const [activeSection, setActiveSection] = useState<NavigationSection>('dashboard');
  const [myBooksCategoryFilter, setMyBooksCategoryFilter] = useState<string>('all');
  const [focusSearchTrigger, setFocusSearchTrigger] = useState<number>(0);

  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [uploadOpen, setUploadOpen] = useState<boolean>(false);
  const [editingBook, setEditingBook] = useState<BookRecord | null>(null);
  const [activeReaderBook, setActiveReaderBook] = useState<BookRecord | null>(null);
  const [pendingDeleteBook, setPendingDeleteBook] = useState<BookRecord | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const lastActivityRef = useRef<number>(Date.now());

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `toast-${crypto.randomUUID()}`;
    setToasts((prev) => [...prev.slice(-1), { id, type, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const loadLibraryState = useCallback(async () => {
    const [allBooks, allProgress, allCategories, currentSettings] = await Promise.all([
      db.books.toArray(),
      db.readingProgress.toArray(),
      db.categories.toArray(),
      db.settings.get('default'),
    ]);
    allCategories.sort((a, b) => a.createdAt - b.createdAt);
    setBooks(allBooks);
    setProgressList(allProgress);
    setCategories(allCategories);
    if (currentSettings) {
      setSettings(currentSettings);
    }
    return currentSettings ?? createDefaultSettings();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initializeLibraryWithStarterBooks();
        void requestPersistentStorage();
        const loadedSettings = await loadLibraryState();
        if (!mounted) return;
        if (
          loadedSettings.security.lockEnabled &&
          loadedSettings.security.pinHash &&
          loadedSettings.security.pinSalt
        ) {
          setIsLocked(true);
        }
      } catch (err) {
        if (mounted) {
          setInitError(
            err instanceof Error ? err.message : 'Unable to open local library database.'
          );
        }
      } finally {
        if (mounted) setInitializing(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadLibraryState]);

  // Sync light/dark theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    const isDark = settings.theme === 'dark';
    root.classList.toggle('dark', isDark);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#18120E' : '#352820');
    }
  }, [settings.theme]);

  // Auto-lock inactivity monitor
  useEffect(() => {
    if (!settings.security.lockEnabled || settings.security.autoLockMinutes <= 0 || isLocked) {
      return;
    }

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
    events.forEach((ev) => window.addEventListener(ev, markActivity, { passive: true }));

    const interval = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= settings.security.autoLockMinutes * 60_000) {
        setActiveReaderBook(null);
        setIsLocked(true);
      }
    }, 10_000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActivity));
      window.clearInterval(interval);
    };
  }, [settings.security.lockEnabled, settings.security.autoLockMinutes, isLocked]);

  const progressByBook = useMemo(() => {
    const map = new Map<string, ReadingProgressRecord>();
    for (const p of progressList) {
      map.set(p.bookId, p);
    }
    return map;
  }, [progressList]);

  const categoriesById = useMemo(() => {
    const map = new Map<string, CategoryRecord>();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  const stats = useMemo(
    () => computeLibraryStats(books, progressList),
    [books, progressList]
  );

  const handleToggleTheme = async () => {
    const nextTheme = settings.theme === 'light' ? 'dark' : 'light';
    const next = await updateSettings((prev) => ({ ...prev, theme: nextTheme }));
    setSettings(next);
  };

  const handleToggleFavorite = async (bookId: string) => {
    const isNowFav = await toggleBookFavorite(bookId);
    await loadLibraryState();
    notify('success', isNowFav ? 'Added to Favorites.' : 'Removed from Favorites.');
  };

  const handleConfirmDeleteBook = async () => {
    if (!pendingDeleteBook) return;
    const target = pendingDeleteBook;
    setPendingDeleteBook(null);
    await deleteBookSafely(target.id);
    await loadLibraryState();
    notify('info', `"${target.title}" removed from your local library.`);
  };

  const handleNavigate = (section: NavigationSection) => {
    if (section !== 'my-books') {
      setMyBooksCategoryFilter('all');
    }
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleCloseReader = useCallback(() => {
    setActiveReaderBook(null);
    void loadLibraryState();
  }, [loadLibraryState]);

  const handleProgressUpdated = useCallback(() => {
    void loadLibraryState();
  }, [loadLibraryState]);

  if (initializing) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F5EFE5] dark:bg-[#18120E] text-[#352820] dark:text-[#F5EFE5]">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <div className="w-10 h-10 rounded-full border-2 border-[#B68B54]/30 border-t-[#B68B54] animate-spin" />
          <p className="font-display text-2xl font-semibold">Opening Your Library...</p>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F5EFE5] dark:bg-[#18120E] p-6">
        <div className="max-w-md rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-red-300 dark:border-red-900 p-6 text-center space-y-3">
          <h1 className="font-display text-2xl font-semibold text-red-800 dark:text-red-300">
            Local Storage Unavailable
          </h1>
          <p className="text-sm text-[#5C4D42] dark:text-[#D8CBB8]">{initError}</p>
        </div>
      </div>
    );
  }

  if (
    isLocked &&
    settings.security.lockEnabled &&
    settings.security.pinHash &&
    settings.security.pinSalt
  ) {
    return (
      <LockScreen
        pinHash={settings.security.pinHash}
        pinSalt={settings.security.pinSalt}
        onUnlock={() => {
          lastActivityRef.current = Date.now();
          setIsLocked(false);
        }}
      />
    );
  }

  return (
    <>
      <NavigationShell
        activeSection={activeSection}
        theme={settings.theme}
        lockEnabled={settings.security.lockEnabled}
        onNavigate={handleNavigate}
        onToggleTheme={handleToggleTheme}
        onLockNow={() => setIsLocked(true)}
        onOpenUpload={() => setUploadOpen(true)}
      >
        {activeSection === 'dashboard' && (
          <DashboardView
            stats={stats}
            books={books}
            progressByBook={progressByBook}
            categoriesById={categoriesById}
            lockEnabled={settings.security.lockEnabled}
            onLockNow={() => setIsLocked(true)}
            onNavigate={handleNavigate}
            onOpenSearch={() => {
              setMyBooksCategoryFilter('all');
              setActiveSection('my-books');
              setFocusSearchTrigger((n) => n + 1);
            }}
            onOpenUpload={() => setUploadOpen(true)}
            onOpenReader={(book) => setActiveReaderBook(book)}
            onToggleFavorite={handleToggleFavorite}
            onEditBook={(book) => setEditingBook(book)}
            onDeleteBook={(book) => setPendingDeleteBook(book)}
          />
        )}

        {activeSection === 'my-books' && (
          <MyBooksView
            books={books}
            progressByBook={progressByBook}
            categories={categories}
            categoriesById={categoriesById}
            defaultViewMode={settings.libraryPreferences.defaultViewMode}
            defaultSort={settings.libraryPreferences.defaultSort}
            initialCategoryFilter={myBooksCategoryFilter}
            focusSearchTrigger={focusSearchTrigger}
            onOpenUpload={() => setUploadOpen(true)}
            onOpenReader={(book) => setActiveReaderBook(book)}
            onToggleFavorite={handleToggleFavorite}
            onEditBook={(book) => setEditingBook(book)}
            onDeleteBook={(book) => setPendingDeleteBook(book)}
          />
        )}

        {activeSection === 'continue-reading' && (
          <ContinueReadingView
            books={books}
            progressByBook={progressByBook}
            categoriesById={categoriesById}
            onOpenReader={(book) => setActiveReaderBook(book)}
            onBrowseAll={() => setActiveSection('my-books')}
          />
        )}

        {activeSection === 'favorites' && (
          <FavoritesView
            books={books}
            progressByBook={progressByBook}
            categoriesById={categoriesById}
            onOpenReader={(book) => setActiveReaderBook(book)}
            onToggleFavorite={handleToggleFavorite}
            onEditBook={(book) => setEditingBook(book)}
            onDeleteBook={(book) => setPendingDeleteBook(book)}
            onBrowseAll={() => setActiveSection('my-books')}
          />
        )}

        {activeSection === 'categories' && (
          <CategoriesView
            categories={categories}
            books={books}
            onRefresh={() => {
              void loadLibraryState();
            }}
            onSelectCategory={(catId) => {
              setMyBooksCategoryFilter(catId);
              setActiveSection('my-books');
            }}
            onNotify={notify}
          />
        )}

        {activeSection === 'settings' && (
          <SettingsView
            settings={settings}
            onSettingsChanged={(next) => setSettings(next)}
            onLibraryChanged={() => {
              void loadLibraryState();
            }}
            onLockNow={() => setIsLocked(true)}
            onNotify={notify}
          />
        )}
      </NavigationShell>

      <UploadModal
        open={uploadOpen}
        existingBooks={books}
        categories={categories}
        onClose={() => setUploadOpen(false)}
        onImported={(count) => {
          void loadLibraryState();
          notify('success', `Imported ${count} book${count === 1 ? '' : 's'} into your local library.`);
        }}
      />

      <BookMetadataModal
        book={editingBook}
        progress={editingBook ? progressByBook.get(editingBook.id) : undefined}
        categories={categories}
        onClose={() => setEditingBook(null)}
        onSaved={() => {
          void loadLibraryState();
          notify('success', 'Book details updated.');
        }}
        onOpenReader={(book) => setActiveReaderBook(book)}
      />

      {activeReaderBook && (
        <BookReader
          book={activeReaderBook}
          initialReadingMode={settings.readingMode}
          initialZoom={settings.defaultZoom}
          onClose={handleCloseReader}
          onProgressUpdated={handleProgressUpdated}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteBook)}
        title="Delete Book"
        message={
          pendingDeleteBook
            ? `Permanently remove "${pendingDeleteBook.title}" and its local PDF file from this device? This action cannot be undone unless you have a backup.`
            : ''
        }
        confirmLabel="Delete Book"
        destructive
        onConfirm={handleConfirmDeleteBook}
        onCancel={() => setPendingDeleteBook(null)}
      />

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </>
  );
}
