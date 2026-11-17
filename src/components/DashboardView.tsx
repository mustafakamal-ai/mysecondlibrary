import React from 'react';
import {
  ArrowRight,
  BookOpen,
  Heart,
  Lock,
  Plus,
  Search,
  Settings,
  Unlock,
} from 'lucide-react';
import type {
  BookRecord,
  CategoryRecord,
  LibraryStats,
  NavigationSection,
  ReadingProgressRecord,
} from '../types/library';
import { BookCard, BookCoverArt } from './BookCard';

interface DashboardViewProps {
  stats: LibraryStats;
  books: BookRecord[];
  progressByBook: Map<string, ReadingProgressRecord>;
  categoriesById: Map<string, CategoryRecord>;
  lockEnabled: boolean;
  onLockNow: () => void;
  onNavigate: (section: NavigationSection) => void;
  onOpenSearch: () => void;
  onOpenUpload: () => void;
  onOpenReader: (book: BookRecord) => void;
  onToggleFavorite: (bookId: string) => void;
  onEditBook: (book: BookRecord) => void;
  onDeleteBook: (book: BookRecord) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  books,
  progressByBook,
  categoriesById,
  lockEnabled,
  onLockNow,
  onNavigate,
  onOpenSearch,
  onOpenUpload,
  onOpenReader,
  onToggleFavorite,
  onEditBook,
  onDeleteBook,
}) => {
  const continueReadingBooks = books
    .filter((b) => {
      const prog = progressByBook.get(b.id);
      return b.lastOpened !== null || (prog && prog.lastPage > 0);
    })
    .sort((a, b) => {
      const aTime = progressByBook.get(a.id)?.lastReadAt ?? a.lastOpened ?? 0;
      const bTime = progressByBook.get(b.id)?.lastReadAt ?? b.lastOpened ?? 0;
      return bTime - aTime;
    })
    .slice(0, 4);

  const recentlyAdded = [...books]
    .sort((a, b) => b.dateAdded - a.dateAdded)
    .slice(0, 4);

  const favoriteBooks = books.filter((b) => b.isFavorite).slice(0, 4);

  return (
    <div className="space-y-8">
      {/* Top Dashboard Utility Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#DFD2C0] dark:border-[#3E3027]">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#352820] dark:text-[#F5EFE5] text-balance">
            Welcome to Your Library
          </h1>
          <p className="mt-1 text-sm sm:text-base text-[#5C4D42] dark:text-[#D8CBB8]">
            Your personal collection of knowledge and inspiration.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search library"
            className="min-h-[44px] min-w-[44px] px-3 rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] bg-[#FFFDF9] dark:bg-[#231B16] text-[#352820] dark:text-[#F5EFE5] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D] inline-flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Search className="w-4 h-4 text-[#B68B54]" />
            <span className="hidden sm:inline">Search</span>
          </button>

          <button
            type="button"
            onClick={() => (lockEnabled ? onLockNow() : onNavigate('settings'))}
            aria-label={lockEnabled ? 'Lock library now' : 'Configure library lock'}
            title={lockEnabled ? 'Library Lock Active — Click to Lock' : 'Library Unlocked — Configure PIN'}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] bg-[#FFFDF9] dark:bg-[#231B16] text-[#352820] dark:text-[#F5EFE5] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D] transition-colors"
          >
            {lockEnabled ? (
              <Lock className="w-4 h-4 text-[#B68B54]" />
            ) : (
              <Unlock className="w-4 h-4 text-[#7C6C5F] dark:text-[#A69684]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            aria-label="Open Settings"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] bg-[#FFFDF9] dark:bg-[#231B16] text-[#352820] dark:text-[#F5EFE5] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D] transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenUpload}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Import PDF</span>
          </button>
        </div>
      </div>

      {/* Library Statistics Strip */}
      <section aria-label="Library statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] p-4 sm:p-5">
          <p className="text-xs font-medium text-[#7C6C5F] dark:text-[#A69684]">Total Books</p>
          <p className="mt-2 font-mono-tabular text-2xl sm:text-3xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
            {stats.totalBooks}
          </p>
        </div>

        <div className="rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] p-4 sm:p-5">
          <p className="text-xs font-medium text-[#7C6C5F] dark:text-[#A69684]">Currently Reading</p>
          <p className="mt-2 font-mono-tabular text-2xl sm:text-3xl font-semibold text-[#B68B54]">
            {stats.currentlyReading}
          </p>
        </div>

        <div className="rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] p-4 sm:p-5">
          <p className="text-xs font-medium text-[#7C6C5F] dark:text-[#A69684]">Completed Books</p>
          <p className="mt-2 font-mono-tabular text-2xl sm:text-3xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
            {stats.completedBooks}
          </p>
        </div>

        <div className="rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] p-4 sm:p-5">
          <p className="text-xs font-medium text-[#7C6C5F] dark:text-[#A69684]">Total Pages Read</p>
          <p className="mt-2 font-mono-tabular text-2xl sm:text-3xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
            {stats.totalPagesRead.toLocaleString()}
          </p>
        </div>
      </section>

      {/* Continue Reading Section */}
      <section aria-labelledby="dash-continue-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="dash-continue-heading"
            className="font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]"
          >
            Continue Reading
          </h2>
          {continueReadingBooks.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('continue-reading')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#B68B54] hover:underline min-h-[36px] px-2"
            >
              <span>View all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {continueReadingBooks.length === 0 ? (
          <div className="rounded-2xl border border-[#DFD2C0] dark:border-[#3E3027] bg-[#FFFDF9] dark:bg-[#231B16] p-6 text-center">
            <p className="text-sm text-[#5C4D42] dark:text-[#D8CBB8]">
              Open any book from your shelf to begin tracking your reading position automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {continueReadingBooks.map((book) => {
              const prog = progressByBook.get(book.id);
              const lastPage = prog?.lastPage ?? 1;
              const pct = prog?.progressPercentage ?? 0;

              return (
                <article
                  key={book.id}
                  className="flex gap-4 p-4 rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] shadow-xs"
                >
                  <button
                    type="button"
                    onClick={() => onOpenReader(book)}
                    aria-label={`Continue reading "${book.title}"`}
                    className="shrink-0 w-20 h-28 sm:w-24 sm:h-34 rounded-xl overflow-hidden border border-[#DFD2C0] dark:border-[#3E3027] bg-[#EBE1D2] dark:bg-[#2E241D]"
                  >
                    <BookCoverArt book={book} />
                  </button>

                  <div className="min-w-0 flex-1 flex flex-col">
                    <h3 className="font-display text-xl font-semibold text-[#352820] dark:text-[#F5EFE5] line-clamp-1">
                      {book.title}
                    </h3>
                    <p className="text-sm text-[#5C4D42] dark:text-[#D8CBB8] truncate">
                      {book.author}
                    </p>

                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-[#7C6C5F] dark:text-[#A69684] font-mono-tabular">
                        <span>Page {lastPage} of {book.totalPages}</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#EBE1D2] dark:bg-[#2E241D] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#B68B54]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-auto pt-3">
                      <button
                        type="button"
                        onClick={() => onOpenReader(book)}
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-xs font-medium hover:opacity-90 transition-opacity"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Continue Reading</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Recently Added Section */}
      <section aria-labelledby="dash-recent-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="dash-recent-heading"
            className="font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]"
          >
            Recently Added
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('my-books')}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#B68B54] hover:underline min-h-[36px] px-2"
          >
            <span>Browse all books</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentlyAdded.length === 0 ? (
          <div className="rounded-2xl border border-[#DFD2C0] dark:border-[#3E3027] bg-[#FFFDF9] dark:bg-[#231B16] p-8 text-center">
            <p className="text-sm text-[#5C4D42] dark:text-[#D8CBB8]">
              Your shelf is empty. Import your first PDF book to start reading offline.
            </p>
            <button
              type="button"
              onClick={onOpenUpload}
              className="mt-4 inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              <span>Import PDF Book</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {recentlyAdded.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                progress={progressByBook.get(book.id)}
                category={categoriesById.get(book.categoryId)}
                onOpenReader={onOpenReader}
                onToggleFavorite={onToggleFavorite}
                onEdit={onEditBook}
                onDelete={onDeleteBook}
              />
            ))}
          </div>
        )}
      </section>

      {/* Favorite Books Section */}
      <section aria-labelledby="dash-favorites-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="dash-favorites-heading"
            className="font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]"
          >
            Favorite Books
          </h2>
          {favoriteBooks.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('favorites')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#B68B54] hover:underline min-h-[36px] px-2"
            >
              <span>All favorites</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {favoriteBooks.length === 0 ? (
          <div className="rounded-2xl border border-[#DFD2C0] dark:border-[#3E3027] bg-[#FFFDF9] dark:bg-[#231B16] p-6 flex items-center gap-3 text-sm text-[#5C4D42] dark:text-[#D8CBB8]">
            <Heart className="w-4 h-4 text-[#B68B54] shrink-0" />
            <span>Tap the heart icon on any book to keep your cherished volumes here.</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {favoriteBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                progress={progressByBook.get(book.id)}
                category={categoriesById.get(book.categoryId)}
                onOpenReader={onOpenReader}
                onToggleFavorite={onToggleFavorite}
                onEdit={onEditBook}
                onDelete={onDeleteBook}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
