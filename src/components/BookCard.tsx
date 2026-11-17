import React from 'react';
import { BookOpen, Heart, Info, Pencil, Trash2 } from 'lucide-react';
import type { BookRecord, CategoryRecord, ReadingProgressRecord } from '../types/library';
import { formatBytes } from '../utils/libraryLogic';

interface BookCardProps {
  book: BookRecord;
  progress?: ReadingProgressRecord;
  category?: CategoryRecord;
  viewMode?: 'grid' | 'list';
  onOpenReader: (book: BookRecord) => void;
  onToggleFavorite: (bookId: string) => void;
  onEdit: (book: BookRecord) => void;
  onDelete: (book: BookRecord) => void;
}

function getStatusLabel(status: BookRecord['readingStatus']): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'reading':
      return 'Reading';
    case 'not_started':
    default:
      return 'Not Started';
  }
}

export const BookCoverArt: React.FC<{ book: BookRecord; className?: string }> = ({
  book,
  className = '',
}) => {
  if (book.cover) {
    return (
      <img
        src={book.cover}
        alt={`Cover of ${book.title}`}
        referrerPolicy="no-referrer"
        className={`w-full h-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`w-full h-full flex flex-col justify-between p-4 bg-gradient-to-br from-[#352820] via-[#4A382C] to-[#29201A] text-[#F5EFE5] ${className}`}
    >
      <span className="text-[10px] tracking-widest uppercase text-[#B68B54]">
        Private Edition
      </span>
      <div>
        <p className="font-display text-lg font-semibold leading-tight line-clamp-3">
          {book.title}
        </p>
        <p className="mt-1 text-xs text-[#E8DCCB]/80 truncate">{book.author}</p>
      </div>
    </div>
  );
};

export const BookCard: React.FC<BookCardProps> = ({
  book,
  progress,
  category,
  viewMode = 'grid',
  onOpenReader,
  onToggleFavorite,
  onEdit,
  onDelete,
}) => {
  const pct = progress?.progressPercentage ?? 0;
  const lastPage = progress?.lastPage ?? 0;
  const statusLabel = getStatusLabel(book.readingStatus);

  if (viewMode === 'list') {
    return (
      <article className="group flex items-center gap-4 p-3 sm:p-4 rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] shadow-xs hover:shadow-md transition-shadow">
        <button
          type="button"
          onClick={() => onOpenReader(book)}
          aria-label={`Read "${book.title}"`}
          className="shrink-0 w-16 h-22 sm:w-20 sm:h-28 rounded-lg overflow-hidden border border-[#DFD2C0] dark:border-[#3E3027] bg-[#EBE1D2] dark:bg-[#2E241D]"
        >
          <BookCoverArt book={book} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => onOpenReader(book)}
                className="text-left font-display text-xl font-semibold text-[#352820] dark:text-[#F5EFE5] hover:text-[#B68B54] transition-colors line-clamp-1"
              >
                {book.title}
              </button>
              <p className="text-sm text-[#5C4D42] dark:text-[#D8CBB8] truncate">{book.author}</p>
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#7C6C5F] dark:text-[#A69684]">
            <span>{category?.name || 'Uncategorized'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">{book.totalPages} pages</span>
            <span aria-hidden="true">·</span>
            <span>{statusLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">{formatBytes(book.fileSize)}</span>
          </div>

          {lastPage > 0 && (
            <div className="mt-2.5 max-w-md flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-[#EBE1D2] dark:bg-[#2E241D] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#B68B54]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-mono-tabular text-[#5C4D42] dark:text-[#D8CBB8] whitespace-nowrap">
                Page {lastPage}/{book.totalPages} ({pct}%)
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onOpenReader(book)}
            aria-label={`Open "${book.title}" in reader`}
            className="hidden sm:inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-xs font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{lastPage > 0 ? 'Continue' : 'Read'}</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleFavorite(book.id)}
            aria-label={book.isFavorite ? `Remove "${book.title}" from favorites` : `Add "${book.title}" to favorites`}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#7C6C5F] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D] transition-colors"
          >
            <Heart
              className={`w-4 h-4 ${
                book.isFavorite ? 'fill-[#B68B54] text-[#B68B54]' : ''
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => onEdit(book)}
            aria-label={`Edit details for "${book.title}"`}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#7C6C5F] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D] transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(book)}
            aria-label={`Delete "${book.title}"`}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#7C6C5F] hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="group flex flex-col rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] shadow-xs hover:shadow-md transition-all overflow-hidden">
      <div className="relative aspect-[3/4] bg-[#EBE1D2] dark:bg-[#2E241D] overflow-hidden">
        <button
          type="button"
          onClick={() => onOpenReader(book)}
          aria-label={`Read "${book.title}"`}
          className="block w-full h-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B68B54]"
        >
          <BookCoverArt
            book={book}
            className="transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </button>

        <button
          type="button"
          onClick={() => onToggleFavorite(book.id)}
          aria-label={book.isFavorite ? `Remove "${book.title}" from favorites` : `Add "${book.title}" to favorites`}
          className="absolute top-2.5 right-2.5 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full bg-[#FFFDF9]/90 dark:bg-[#18120E]/85 backdrop-blur-xs border border-[#DFD2C0]/80 dark:border-[#3E3027] text-[#352820] dark:text-[#F5EFE5] shadow-xs hover:scale-105 transition-transform"
        >
          <Heart
            className={`w-4 h-4 ${
              book.isFavorite ? 'fill-[#B68B54] text-[#B68B54]' : ''
            }`}
          />
        </button>

        {lastPage > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/25">
            <div
              className="h-full bg-[#B68B54]"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      <div className="p-3 sm:p-4 flex flex-col flex-1">
        <div className="text-[11px] sm:text-xs text-[#7C6C5F] dark:text-[#A69684] flex items-center gap-1 min-w-0">
          <span className="truncate">{category?.name || 'Uncategorized'}</span>
          <span aria-hidden="true" className="shrink-0">·</span>
          <span className="shrink-0 whitespace-nowrap">{statusLabel}</span>
        </div>

        <button
          type="button"
          onClick={() => onOpenReader(book)}
          className="mt-1 text-left font-display text-xl font-semibold leading-snug text-[#352820] dark:text-[#F5EFE5] hover:text-[#B68B54] transition-colors line-clamp-2"
        >
          {book.title}
        </button>

        <p className="mt-0.5 text-sm text-[#5C4D42] dark:text-[#D8CBB8] truncate">
          {book.author}
        </p>

        <div className="mt-auto pt-3 flex items-center justify-between gap-1.5 text-xs text-[#7C6C5F] dark:text-[#A69684] border-t border-[#DFD2C0]/60 dark:border-[#3E3027]/70">
          <span className="font-mono-tabular whitespace-nowrap truncate">
            {lastPage > 0 ? `P. ${lastPage}/${book.totalPages} (${pct}%)` : `${book.totalPages} pages`}
          </span>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => onEdit(book)}
              aria-label={`View or edit info for "${book.title}"`}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D] text-[#5C4D42] dark:text-[#D8CBB8] transition-colors"
            >
              <Info className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(book)}
              aria-label={`Delete "${book.title}"`}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-[#5C4D42] dark:text-[#D8CBB8] hover:text-red-700 dark:hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
