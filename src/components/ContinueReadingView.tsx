import React from 'react';
import { BookOpen } from 'lucide-react';
import type { BookRecord, CategoryRecord, ReadingProgressRecord } from '../types/library';
import { formatRelativeDate } from '../utils/libraryLogic';
import { BookCoverArt } from './BookCard';

interface ContinueReadingViewProps {
  books: BookRecord[];
  progressByBook: Map<string, ReadingProgressRecord>;
  categoriesById: Map<string, CategoryRecord>;
  onOpenReader: (book: BookRecord) => void;
  onBrowseAll: () => void;
}

export const ContinueReadingView: React.FC<ContinueReadingViewProps> = ({
  books,
  progressByBook,
  categoriesById,
  onOpenReader,
  onBrowseAll,
}) => {
  const activeBooks = books
    .filter((b) => {
      const prog = progressByBook.get(b.id);
      return b.lastOpened !== null || (prog && prog.lastPage > 0);
    })
    .sort((a, b) => {
      const aTime = progressByBook.get(a.id)?.lastReadAt ?? a.lastOpened ?? 0;
      const bTime = progressByBook.get(b.id)?.lastReadAt ?? b.lastOpened ?? 0;
      return bTime - aTime;
    });

  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-[#DFD2C0] dark:border-[#3E3027]">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
          Continue Reading
        </h1>
        <p className="mt-1 text-sm text-[#5C4D42] dark:text-[#D8CBB8]">
          Resume right where you left off. Every page turn is saved automatically on your device.
        </p>
      </div>

      {activeBooks.length === 0 ? (
        <div className="rounded-2xl border border-[#DFD2C0] dark:border-[#3E3027] bg-[#FFFDF9] dark:bg-[#231B16] p-10 text-center">
          <p className="font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
            No active reading sessions yet
          </p>
          <p className="mt-1.5 text-sm text-[#5C4D42] dark:text-[#D8CBB8]">
            Open any book from My Books to begin reading in the 3D page-turning viewer.
          </p>
          <button
            type="button"
            onClick={onBrowseAll}
            className="mt-5 min-h-[44px] px-5 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-sm font-medium"
          >
            Browse My Books
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeBooks.map((book) => {
            const prog = progressByBook.get(book.id);
            const lastPage = prog?.lastPage ?? 1;
            const pct = prog?.progressPercentage ?? 0;
            const lastTime = prog?.lastReadAt ?? book.lastOpened;
            const category = categoriesById.get(book.categoryId);

            return (
              <article
                key={book.id}
                className="flex gap-4 p-4 sm:p-5 rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] shadow-xs"
              >
                <button
                  type="button"
                  onClick={() => onOpenReader(book)}
                  aria-label={`Resume "${book.title}"`}
                  className="shrink-0 w-24 h-36 rounded-xl overflow-hidden border border-[#DFD2C0] dark:border-[#3E3027] bg-[#EBE1D2] dark:bg-[#2E241D]"
                >
                  <BookCoverArt book={book} />
                </button>

                <div className="min-w-0 flex-1 flex flex-col">
                  <div className="text-xs text-[#7C6C5F] dark:text-[#A69684] flex items-center gap-1.5 truncate">
                    <span>{category?.name || 'Uncategorized'}</span>
                    <span aria-hidden="true">·</span>
                    <span>Last read {formatRelativeDate(lastTime)}</span>
                  </div>

                  <h2 className="mt-1 font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5] line-clamp-1">
                    {book.title}
                  </h2>
                  <p className="text-sm text-[#5C4D42] dark:text-[#D8CBB8] truncate">
                    {book.author}
                  </p>

                  <div className="mt-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono-tabular text-[#5C4D42] dark:text-[#D8CBB8]">
                      <span>Page {lastPage} of {book.totalPages}</span>
                      <span>{pct}% complete</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#EBE1D2] dark:bg-[#2E241D] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#B68B54]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-auto pt-4">
                    <button
                      type="button"
                      onClick={() => onOpenReader(book)}
                      className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Continue from Page {lastPage}</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
